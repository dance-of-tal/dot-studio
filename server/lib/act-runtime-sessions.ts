import { getOpencode } from './opencode.js'
import { buildPromptEnvelope } from './prompt.js'
import { buildEnabledToolMap, describeUnavailableRuntimeTools, resolveRuntimeTools } from './runtime-tools.js'
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
    buildOrchestratorFormat,
    buildPersistentHandle,
    extractTextFromResponse,
    getOrchestratorRoutes,
    summarizeText,
} from './act-runtime-routing.js'
import { registerSessionExecutionContext } from './session-execution.js'
import type {
    ActMachineContext,
    ActSessionLifetime,
    ActSessionPolicy,
    PendingSessionDirective,
    ResolvedSession,
    RuntimeAssetRef,
    RuntimePerformer,
    SessionRecord,
    StageActInput,
    StageActOrchestratorNode,
    StageActWorkerNode,
    ThreadSessionHandleRecord,
} from './act-runtime-types.js'

export function runtimeAssetRefKey(ref: RuntimeAssetRef | null | undefined) {
    if (!ref) {
        return null
    }
    return ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
}

export function resolveNodeSessionSettings(
    act: Pick<StageActInput, 'sessionMode'>,
    node: StageActWorkerNode | StageActOrchestratorNode,
) {
    if (node.sessionModeOverride || normalizeActSessionMode(act.sessionMode) === 'default') {
        return {
            policy: node.sessionPolicy,
            lifetime: node.sessionLifetime,
            inheritedFromAct: false,
        }
    }

    return {
        policy: 'node' as const,
        lifetime: 'thread' as const,
        inheritedFromAct: true,
    }
}

function normalizeActSessionMode(mode: string | null | undefined): string {
    return mode === 'default' ? 'default' : 'all_nodes_thread'
}

export function buildNodeRuntimeConfigKey(
    act: StageActInput,
    node: StageActWorkerNode | StageActOrchestratorNode,
    performer: RuntimePerformer,
    modelVariant: string | null,
) {
    const agentId = performer.agentId || (performer.planMode ? 'plan' : 'build')
    const session = resolveNodeSessionSettings(act, node)
    return JSON.stringify({
        nodeType: node.type,
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
        actSessionMode: normalizeActSessionMode(act.sessionMode),
        sessionPolicy: session.policy,
        sessionLifetime: session.lifetime,
        sessionModeOverride: !!node.sessionModeOverride,
    })
}

export function buildSessionScopeKey(
    context: ActMachineContext,
    policy: ActSessionPolicy,
    lifetime: ActSessionLifetime,
    nodeId: string,
    performerId: string | null,
) {
    if (policy === 'fresh') {
        return null
    }
    if (lifetime === 'thread') {
        return buildPersistentHandle(context.act, lifetime, policy, nodeId, performerId)
    }
    if (policy === 'node') {
        return `${context.runId}:node:${nodeId}`
    }
    if (policy === 'performer') {
        return `${context.runId}:performer:${performerId || 'unassigned'}`
    }
    return `${context.runId}:act`
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
    policy: ActSessionPolicy,
    lifetime: ActSessionLifetime,
    nodeId: string,
    performerId: string | null,
    configKey: string,
    title: string,
    directive?: PendingSessionDirective | null,
): Promise<ResolvedSession> {
    if (directive?.mode === 'reuse') {
        const handle = directive.handle?.trim()
        if (!handle) {
            throw new Error(`Node '${nodeId}' requested session reuse without a handle.`)
        }
        const existingThreadHandle = context.threadSessionHandles.get(handle)
        if (!existingThreadHandle) {
            throw new Error(`Session handle '${handle}' is not available for this act thread.`)
        }
        if (existingThreadHandle.configKey && existingThreadHandle.configKey !== configKey) {
            throw new Error(`Session handle '${handle}' no longer matches the current node runtime configuration.`)
        }
        const oc = await getOpencode()
        return {
            oc,
            sessionId: existingThreadHandle.sessionId,
            configKey,
            ephemeral: false,
            source: 'thread',
            scopeKey: handle,
        }
    }

    if (directive?.mode === 'fresh') {
        const fresh = await createSession(context.cwd, title)
        await registerActSessionContext(context, fresh.sessionId)
        const persistentHandle = buildPersistentHandle(context.act, lifetime, policy, nodeId, performerId)
        return {
            ...fresh,
            configKey,
            ephemeral: !persistentHandle,
            source: persistentHandle ? 'thread' : 'fresh',
            ...(persistentHandle ? { scopeKey: persistentHandle } : {}),
        }
    }

    const scopeKey = buildSessionScopeKey(context, policy, lifetime, nodeId, performerId)
    if (!scopeKey) {
        const fresh = await createSession(context.cwd, title)
        await registerActSessionContext(context, fresh.sessionId)
        return {
            ...fresh,
            configKey,
            ephemeral: true,
            source: 'fresh',
        }
    }

    if (lifetime === 'thread') {
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
            source: 'run',
        }
    }

    const created = await createSession(context.cwd, title)
    await registerActSessionContext(context, created.sessionId)
    context.sessionPool.set(scopeKey, {
        scopeKey,
        sessionId: created.sessionId,
        configKey,
        policy,
        lifetime,
        nodeId,
        performerId,
    })
    return {
        ...created,
        configKey,
        scopeKey,
        ephemeral: false,
        source: 'run',
    }
}

export async function invokePerformer(
    context: ActMachineContext,
    node: StageActWorkerNode | StageActOrchestratorNode,
    performer: RuntimePerformer,
    input: string,
    title: string,
    directive?: PendingSessionDirective | null,
) {
    assertActNotAborted(context)
    if (!performer.model) {
        throw new Error(`Performer '${performer.name}' is missing a model.`)
    }

    const selectedModelVariant = node.modelVariant || performer.modelVariant || null
    const sessionSettings = resolveNodeSessionSettings(context.act, node)
    const configKey = buildNodeRuntimeConfigKey(context.act, node, performer, selectedModelVariant)

    const envelope = await buildPromptEnvelope({
        cwd: context.cwd,
        talRef: performer.talRef,
        danceRefs: performer.danceRefs,
        drafts: context.drafts,
        model: performer.model,
        modelVariant: selectedModelVariant,
        danceDeliveryMode: performer.danceDeliveryMode,
    })
    const toolResolution = await resolveRuntimeTools(
        context.cwd,
        performer.model,
        performer.mcpServerNames,
    )
    const unavailableSummary = describeUnavailableRuntimeTools(toolResolution)
    if (toolResolution.selectedMcpServers.length > 0 && toolResolution.resolvedTools.length === 0 && unavailableSummary) {
        throw new Error(`Selected MCP servers are unavailable: ${unavailableSummary}.`)
    }
    const tools = buildEnabledToolMap([
        ...toolResolution.resolvedTools,
        ...(envelope.toolName ? [envelope.toolName] : []),
    ])
    const runtimeSystem = buildActRuntimeSystem(context, node)
    const orchestratorRoutes = node.type === 'orchestrator'
        ? getOrchestratorRoutes(context.act, node.id)
        : []

    const session = await resolveSession(
        context,
        sessionSettings.policy,
        sessionSettings.lifetime,
        node.id,
        node.performerId,
        configKey,
        title,
        directive,
    )
    emitActPerformerBinding(context, session.sessionId, node, performer)

    try {
        assertActNotAborted(context)
        const result = unwrapPromptResult<{ info: unknown; parts: unknown[] }>(await session.oc.session.prompt({
            sessionID: session.sessionId,
            directory: context.cwd,
            model: { providerID: performer.model.provider, modelID: performer.model.modelId },
            agent: performer.agentId || (performer.planMode ? 'plan' : 'build'),
            system: runtimeSystem ? `${envelope.system}\n\n${runtimeSystem}` : envelope.system,
            ...(selectedModelVariant ? { variant: selectedModelVariant } : {}),
            ...(tools ? { tools } : {}),
            ...(node.type === 'orchestrator' ? { format: buildOrchestratorFormat(orchestratorRoutes) } : {}),
            parts: [{ type: 'text', text: input }],
        }))

        return {
            output: extractTextFromResponse(result),
            session,
        }
    } catch (error) {
        if (isAbortRequested(context.actSessionId)) {
            await releaseEphemeralSession(context.cwd, session, false)
            throw new ActRuntimeInterruptedError()
        }
        await releaseEphemeralSession(context.cwd, session, false)
        throw error
    }
}

export async function rememberThreadHandle(
    context: ActMachineContext,
    node: StageActWorkerNode | StageActOrchestratorNode,
    session: ResolvedSession,
    output: string,
) {
    if (!context.actSessionId) {
        return false
    }

    const sessionSettings = resolveNodeSessionSettings(context.act, node)
    const handle = session.scopeKey || buildPersistentHandle(
        context.act,
        sessionSettings.lifetime,
        sessionSettings.policy,
        node.id,
        node.performerId,
    )
    if (!handle) {
        return false
    }
    const existing = context.threadSessionHandles.get(handle)
    if (existing && existing.sessionId !== session.sessionId && session.source !== 'thread') {
        return false
    }
    if (existing && existing.sessionId !== session.sessionId && session.source === 'thread') {
        await deleteSession(context.cwd, existing.sessionId)
    }

    context.threadSessionHandles.set(handle, {
        handle,
        sessionId: session.sessionId,
        configKey: session.configKey,
        nodeId: node.id,
        nodeType: node.type,
        performerId: node.performerId,
        status: 'warm',
        turnCount: (existing?.turnCount || 0) + 1,
        lastUsedAt: Date.now(),
        summary: summarizeText(output),
    })

    if (session.scopeKey) {
        const pooled = context.sessionPool.get(session.scopeKey)
        if (pooled) {
            pooled.persistentHandle = handle
        }
    }

    return true
}

export async function releaseEphemeralSession(cwd: string, session: ResolvedSession, keepAlive: boolean) {
    if (session.ephemeral && !keepAlive) {
        await deleteSession(cwd, session.sessionId)
    }
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
