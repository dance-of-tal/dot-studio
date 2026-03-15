import { getOpencode } from './opencode.js'
import { describeUnavailableRuntimeTools } from './runtime-tools.js'
import { unwrapOpencodeResult, unwrapPromptResult } from './opencode-errors.js'
import {
    ActRuntimeInterruptedError,
    assertActNotAborted,
    emitActPerformerBinding,
    isAbortRequested,
    serializeSessionRecord,
} from './act-runtime-events.js'
import {
    buildActRuntimeSystem,
    buildPersistentHandle,
    extractTextFromResponse,
    summarizeText,
} from './act-runtime-routing.js'
import { registerSessionExecutionContext } from './session-execution.js'
import { ensureActPerformerProjection } from '../services/opencode-projection/act-compiler.js'
import type {
    ActMachineContext,
    ResolvedSession,
    RuntimeAssetRef,
    RuntimePerformer,
    SessionRecord,
    StageActWorkerNode,
    ThreadSessionHandleRecord,
} from './act-runtime-types.js'

export function runtimeAssetRefKey(ref: RuntimeAssetRef | null | undefined) {
    if (!ref) {
        return null
    }
    return ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
}

export function buildNodeRuntimeConfigKey(
    context: ActMachineContext,
    node: StageActWorkerNode,
    performer: RuntimePerformer,
    modelVariant: string | null,
) {
    const agentId = performer.agentId || (performer.planMode ? 'plan' : 'build')
    return JSON.stringify({
        nodeId: node.id,
        performerId: node.performerId || null,
        talRef: runtimeAssetRefKey(performer.talRef),
        danceRefs: performer.danceRefs.map((ref) => runtimeAssetRefKey(ref)).filter(Boolean).sort(),
        model: performer.model
            ? { provider: performer.model.provider, modelId: performer.model.modelId }
            : null,
        agentId,
        modelVariant: modelVariant || null,
        mcpServerNames: [...performer.mcpServerNames].sort(),
        danceDeliveryMode: performer.danceDeliveryMode,
        relationSignature: context.act.edges
            .filter((edge) => edge.from === node.id)
            .map((edge) => ({
                to: edge.to,
                description: edge.description || '',
            }))
            .sort((left, right) => (
                left.to.localeCompare(right.to)
                || left.description.localeCompare(right.description)
            )),
    })
}

async function registerActSessionContext(
    context: ActMachineContext,
    sessionId: string,
) {
    await registerSessionExecutionContext({
        sessionId,
        ownerKind: 'act',
        ownerId: context.act.id,
        mode: context.executionMode || 'direct',
        workingDir: context.baseWorkingDir || context.cwd,
        executionDir: context.cwd,
    })
}

export async function createSession(cwd: string, title: string) {
    const oc = await getOpencode()
    const session = unwrapOpencodeResult<{ id: string }>(await oc.session.create({
        directory: cwd,
        title,
    }))
    return {
        oc,
        sessionId: session.id,
    }
}

export async function deleteSession(cwd: string, sessionId: string) {
    const oc = await getOpencode()
    await Promise.race([
        oc.session.delete({
            sessionID: sessionId,
            directory: cwd,
        }).then((result) => {
            unwrapOpencodeResult(result)
        }).catch(() => undefined),
        new Promise<void>((resolve) => {
            setTimeout(resolve, 1500)
        }),
    ])
}

export async function resolveSession(
    context: ActMachineContext,
    node: StageActWorkerNode,
    performer: RuntimePerformer,
    configKey: string,
    title: string,
): Promise<ResolvedSession> {
    const scopeKey = buildPersistentHandle(node.id)
    const existingThreadHandle = context.threadSessionHandles.get(scopeKey)
    if (existingThreadHandle && (!existingThreadHandle.configKey || existingThreadHandle.configKey === configKey)) {
        const oc = await getOpencode()
        return {
            oc,
            sessionId: existingThreadHandle.sessionId,
            configKey,
            scopeKey,
            ephemeral: false,
            source: 'thread',
        }
    }

    const existing = context.sessionPool.get(scopeKey)
    if (existing && (!existing.configKey || existing.configKey === configKey)) {
        const oc = await getOpencode()
        return {
            oc,
            sessionId: existing.sessionId,
            configKey,
            scopeKey,
            ephemeral: false,
            source: 'thread',
        }
    }

    const created = await createSession(context.cwd, title)
    await registerActSessionContext(context, created.sessionId)
    context.sessionPool.set(scopeKey, {
        scopeKey,
        sessionId: created.sessionId,
        configKey,
        nodeId: node.id,
        performerId: performer.id,
    })
    return {
        ...created,
        configKey,
        scopeKey,
        ephemeral: false,
        source: 'fresh',
    }
}

export async function invokePerformer(
    context: ActMachineContext,
    node: StageActWorkerNode,
    performer: RuntimePerformer,
    input: string,
    title: string,
) {
    assertActNotAborted(context)
    if (!performer.model) {
        throw new Error(`Performer '${performer.name}' is missing a model.`)
    }

    const selectedModelVariant = node.modelVariant || performer.modelVariant || null
    const configKey = buildNodeRuntimeConfigKey(context, node, performer, selectedModelVariant)
    const requestTargets = context.act.edges
        .filter((edge) => edge.from === node.id && edge.to !== '$exit')
        .map((edge) => ({
            edge,
            targetNode: context.act.nodes.find((candidate) => candidate.id === edge.to),
        }))
        .filter((item): item is { edge: typeof item.edge; targetNode: StageActWorkerNode } => !!item.targetNode)
        .map(({ edge, targetNode }) => {
            const targetPerformer = targetNode.performerId ? context.performersById[targetNode.performerId] || null : null
            if (!targetNode.performerId || !targetPerformer) {
                return null
            }
            return {
                performerId: targetNode.performerId,
                performerName: targetPerformer.name,
                description: edge.description || '',
            }
        })
        .filter((value): value is NonNullable<typeof value> => value !== null)

    const ensured = await ensureActPerformerProjection({
        actId: context.act.id,
        performerId: performer.id,
        performerName: performer.name,
        talRef: performer.talRef,
        danceRefs: performer.danceRefs,
        drafts: context.drafts,
        model: performer.model,
        modelVariant: selectedModelVariant,
        mcpServerNames: performer.mcpServerNames,
        executionDir: context.cwd,
        workingDir: context.baseWorkingDir || context.cwd,
        requestTargets,
    })
    const unavailableSummary = describeUnavailableRuntimeTools(ensured.toolResolution)
    if (ensured.toolResolution.selectedMcpServers.length > 0 && ensured.toolResolution.resolvedTools.length === 0 && unavailableSummary) {
        throw new Error(`Selected MCP servers are unavailable: ${unavailableSummary}.`)
    }

    const session = await resolveSession(context, node, performer, configKey, title)
    emitActPerformerBinding(context, session.sessionId, node, performer)

    try {
        assertActNotAborted(context)
        const result = unwrapPromptResult<{ info: unknown; parts: unknown[] }>(await session.oc.session.prompt({
            sessionID: session.sessionId,
            directory: context.cwd,
            agent: ensured.compiled.agentNames[performer.planMode ? 'plan' : 'build'],
            system: buildActRuntimeSystem(context, node),
            parts: [{ type: 'text', text: input }],
        }))

        return {
            output: extractTextFromResponse(result),
            session,
        }
    } catch (error) {
        if (isAbortRequested(context.actSessionId)) {
            throw new ActRuntimeInterruptedError()
        }
        throw error
    }
}

export async function rememberThreadHandle(
    context: ActMachineContext,
    node: StageActWorkerNode,
    session: ResolvedSession,
    output: string,
) {
    if (!context.actSessionId || !session.scopeKey) {
        return false
    }

    context.threadSessionHandles.set(session.scopeKey, {
        handle: session.scopeKey,
        sessionId: session.sessionId,
        configKey: session.configKey,
        nodeId: node.id,
        nodeType: 'worker',
        performerId: node.performerId,
        status: 'warm',
        turnCount: (context.threadSessionHandles.get(session.scopeKey)?.turnCount || 0) + 1,
        lastUsedAt: Date.now(),
        summary: summarizeText(output),
    })
    return true
}

export async function releaseEphemeralSession(_cwd: string, _session: ResolvedSession, _keepAlive: boolean) {
    return
}

export async function cleanupSessionPool(
    cwd: string,
    sessionPool: Map<string, SessionRecord>,
    threadSessionHandles: Map<string, ThreadSessionHandleRecord>,
) {
    const persistentSessionIds = new Set(Array.from(threadSessionHandles.values()).map((session) => session.sessionId))
    await Promise.all(
        Array.from(sessionPool.values())
            .filter((session) => !persistentSessionIds.has(session.sessionId))
            .map((session) => deleteSession(cwd, session.sessionId)),
    )
}

export { serializeSessionRecord }
