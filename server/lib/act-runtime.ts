import { readAsset } from 'dance-of-tal/lib/registry'
import type { Act } from 'dance-of-tal/data/types'
import { normalizeOpencodeError } from './opencode-errors.js'
import {
    clearActRuntimeAbortRequest,
    emitActRuntimeProgress,
    getThreadRuntimeHandles,
    isAbortRequested,
    persistThreadRuntimeHandles,
    serializeSessionRecord,
    serializeThreadSessionHandle,
} from './act-runtime-events.js'
import {
    buildInitialSharedState,
    getNextTargets,
} from './act-runtime-routing.js'
import {
    cleanupSessionPool,
    invokePerformer,
    rememberThreadHandle,
    releaseEphemeralSession,
} from './act-runtime-sessions.js'
import type {
    ActMachineContext,
    RunActRuntimeInput,
    RuntimePerformer,
    StageActInput,
    StagePerformerInput,
    StageActWorkerNode,
} from './act-runtime-types.js'

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function describeActRuntimeError(error: unknown, performer?: RuntimePerformer | null) {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }

    const normalized = normalizeOpencodeError(
        error,
        performer?.model ? { model: performer.model } : {},
    )
    return normalized.error || normalized.detail || 'OpenCode request failed.'
}

function stageActFromRegistryAct(act: Act): { stageAct: StageActInput; performers: StagePerformerInput[] } {
    const performerIdByUrn = new Map<string, string>()
    const performers: StagePerformerInput[] = []

    for (const [nodeId, node] of Object.entries(act.nodes || {})) {
        if (node.type !== 'worker' || typeof node.performer !== 'string') {
            throw new Error(`Unsupported act asset node '${nodeId}'. PRD-001 only supports worker nodes.`)
        }
        const performerUrn = node.performer.trim()
        if (!performerIdByUrn.has(performerUrn)) {
            const id = makeId('performer')
            performerIdByUrn.set(performerUrn, id)
            performers.push({
                id,
                name: performerUrn.split('/').pop() || 'Performer',
                meta: { derivedFrom: performerUrn },
                agentId: null,
                modelVariant: null,
                danceDeliveryMode: 'auto',
                planMode: false,
            })
        }
    }

    const stageAct: StageActInput = {
        id: makeId('act'),
        name: act.name,
        description: act.description,
        meta: act.type.startsWith('act/') ? { derivedFrom: act.type } : undefined,
        entryNodeId: act.entryNode,
        nodes: Object.entries(act.nodes || {}).map(([id, node]) => {
            if (node.type !== 'worker') {
                throw new Error(`Unsupported act asset node '${id}'. PRD-001 only supports worker nodes.`)
            }
            return {
                id,
                type: 'worker' as const,
                performerId: performerIdByUrn.get(node.performer) || null,
                modelVariant: null,
                position: { x: 28, y: 56 },
            }
        }),
        edges: (act.edges || []).map((edge, index) => ({
            id: `edge-${index + 1}`,
            from: edge.from,
            to: edge.to,
            description: typeof (edge as any).description === 'string'
                ? (edge as any).description
                : '',
        })),
        maxIterations: act.maxIterations || 10,
    }

    return { stageAct, performers }
}

async function loadActDefinition(cwd: string, actUrn: string): Promise<Act> {
    if (!actUrn.startsWith('act/')) {
        throw new Error(`Act URN must start with 'act/': ${actUrn}`)
    }

    const act = await readAsset(cwd, actUrn)
    if (!act) {
        throw new Error(`Act asset not found: ${actUrn}`)
    }

    return act as Act
}

async function resolvePerformer(_cwd: string, input: StagePerformerInput): Promise<RuntimePerformer> {
    return {
        id: input.id,
        name: input.name,
        model: input.model !== undefined ? input.model : null,
        modelVariant: input.modelVariant || null,
        agentId: input.agentId || (input.planMode ? 'plan' : 'build'),
        talRef: input.talRef !== undefined ? input.talRef : null,
        danceRefs: input.danceRefs !== undefined ? input.danceRefs : [],
        mcpServerNames: input.mcpServerNames !== undefined ? Array.from(new Set(input.mcpServerNames.filter(Boolean))) : [],
        danceDeliveryMode: input.danceDeliveryMode || 'auto',
        planMode: !!input.planMode,
    }
}

async function resolveActRuntimeInput(input: RunActRuntimeInput): Promise<{
    act: StageActInput
    performers: RuntimePerformer[]
    drafts: Record<string, import('./act-runtime-types.js').RuntimeDraftAsset>
}> {
    let stageAct: StageActInput | null = input.stageAct || null
    let performerInputs: StagePerformerInput[] = input.performers || []

    if (!stageAct && input.actUrn) {
        const normalized = stageActFromRegistryAct(await loadActDefinition(input.cwd, input.actUrn))
        stageAct = normalized.stageAct
        performerInputs = normalized.performers
    }

    if (!stageAct) {
        throw new Error('Either stageAct or actUrn is required.')
    }

    const nonWorkerNode = stageAct.nodes.find((node) => node.type !== 'worker')
    if (nonWorkerNode) {
        throw new Error(`Unsupported stage act node '${nonWorkerNode.id}'. PRD-001 only supports worker nodes.`)
    }

    const performers = await Promise.all(performerInputs.map((performer) => resolvePerformer(input.cwd, performer)))
    return { act: stageAct, performers, drafts: input.drafts || {} }
}

function buildNodeLookup(act: StageActInput) {
    return new Map(act.nodes.map((node) => [node.id, node]))
}

function buildStepTitle(actName: string, node: StageActWorkerNode, performer: RuntimePerformer) {
    return `${actName} · ${performer.name || node.id}`
}

function nextNodeIdFromEdges(act: StageActInput, nodeId: string) {
    const [next] = getNextTargets(act, nodeId)
    if (!next || next === '$exit') {
        return null
    }
    return next
}

async function runWorkerStep(
    context: ActMachineContext,
    node: StageActWorkerNode,
    performer: RuntimePerformer,
) {
    const timestamp = Date.now()
    const invocation = await invokePerformer(
        context,
        node,
        performer,
        context.pendingInput,
        buildStepTitle(context.act.name, node, performer),
    )
    const output = invocation.output
    const keepAlive = await rememberThreadHandle(context, node, invocation.session, output)
    await releaseEphemeralSession(context.cwd, invocation.session, keepAlive)

    context.history.push({
        nodeId: node.id,
        nodeType: 'worker',
        action: 'worker.completed',
        timestamp,
    })
    context.nodeOutputs[node.id] = output
    context.finalOutput = output
    context.pendingInput = output
    context.currentNodeId = nextNodeIdFromEdges(context.act, node.id)
    context.iterations += 1
}

export async function runActRuntime(input: RunActRuntimeInput) {
    clearActRuntimeAbortRequest(input.actSessionId)
    const resolved = await resolveActRuntimeInput(input)
    const performersById = Object.fromEntries(resolved.performers.map((performer) => [performer.id, performer]))
    const threadSessionHandles = getThreadRuntimeHandles(input.actSessionId, resolved.act.id)
    const coldStartResumeSummary = threadSessionHandles.size === 0 ? input.resumeSummary || null : null
    const initialContext: ActMachineContext = {
        runId: makeId('run'),
        actSessionId: input.actSessionId,
        cwd: input.cwd,
        baseWorkingDir: input.baseWorkingDir || input.cwd,
        executionMode: input.executionMode || 'direct',
        act: resolved.act,
        performersById,
        drafts: resolved.drafts,
        currentNodeId: resolved.act.entryNodeId,
        pendingInput: input.input,
        maxIterations: input.maxIterations || resolved.act.maxIterations || 10,
        iterations: 0,
        history: [],
        sharedState: buildInitialSharedState(threadSessionHandles, coldStartResumeSummary),
        nodeOutputs: {},
        resumeSummary: coldStartResumeSummary,
        sessionPool: new Map(),
        threadSessionHandles,
    }

    emitActRuntimeProgress(initialContext, 'running')
    try {
        const nodeLookup = buildNodeLookup(initialContext.act)

        while (initialContext.currentNodeId && initialContext.iterations < initialContext.maxIterations) {
            if (isAbortRequested(initialContext.actSessionId)) {
                initialContext.currentNodeId = null
                initialContext.error = 'Act run interrupted.'
                persistThreadRuntimeHandles(input.actSessionId, resolved.act.id, initialContext.threadSessionHandles)
                emitActRuntimeProgress(initialContext, 'interrupted')
                return {
                    status: 'interrupted' as const,
                    currentNodeId: null,
                    runId: initialContext.runId,
                    finalOutput: initialContext.finalOutput,
                    error: initialContext.error,
                    history: initialContext.history,
                    sharedState: initialContext.sharedState,
                    sessions: Array.from(initialContext.sessionPool.values()).map((session) => serializeSessionRecord(session)),
                    sessionHandles: Array.from(initialContext.threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
                    iterations: initialContext.iterations,
                }
            }

            const node = nodeLookup.get(initialContext.currentNodeId)
            if (!node) {
                throw new Error(`Act entry or relation target '${initialContext.currentNodeId}' does not exist.`)
            }
            const performer = node.performerId ? initialContext.performersById[node.performerId] || null : null
            if (!performer) {
                throw new Error(`Act node '${node.id}' is missing a performer binding.`)
            }

            try {
                await runWorkerStep(initialContext, node, performer)
                emitActRuntimeProgress(initialContext, initialContext.currentNodeId ? 'running' : 'completed')
            } catch (error) {
                const message = describeActRuntimeError(error, performer)
                initialContext.history.push({
                    nodeId: node.id,
                    nodeType: 'worker',
                    action: `worker.failed: ${message}`,
                    timestamp: Date.now(),
                })
                initialContext.currentNodeId = null
                initialContext.error = message
                persistThreadRuntimeHandles(input.actSessionId, resolved.act.id, initialContext.threadSessionHandles)
                emitActRuntimeProgress(initialContext, 'failed')
                await cleanupSessionPool(initialContext.cwd, initialContext.sessionPool, initialContext.threadSessionHandles)
                return {
                    status: 'failed' as const,
                    currentNodeId: null,
                    runId: initialContext.runId,
                    finalOutput: initialContext.finalOutput,
                    error: message,
                    history: initialContext.history,
                    sharedState: initialContext.sharedState,
                    sessions: Array.from(initialContext.sessionPool.values()).map((session) => serializeSessionRecord(session)),
                    sessionHandles: Array.from(initialContext.threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
                    iterations: initialContext.iterations,
                }
            }
        }

        if (initialContext.currentNodeId) {
            initialContext.error = `Act exceeded max iterations (${initialContext.maxIterations}).`
            emitActRuntimeProgress(initialContext, 'failed')
            return {
                status: 'failed' as const,
                currentNodeId: initialContext.currentNodeId,
                runId: initialContext.runId,
                finalOutput: initialContext.finalOutput,
                error: initialContext.error,
                history: initialContext.history,
                sharedState: initialContext.sharedState,
                sessions: Array.from(initialContext.sessionPool.values()).map((session) => serializeSessionRecord(session)),
                sessionHandles: Array.from(initialContext.threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
                iterations: initialContext.iterations,
            }
        }

        persistThreadRuntimeHandles(input.actSessionId, resolved.act.id, initialContext.threadSessionHandles)
        emitActRuntimeProgress(initialContext, 'completed')
        const response = {
            status: 'completed' as const,
            currentNodeId: null,
            runId: initialContext.runId,
            finalOutput: initialContext.finalOutput,
            error: initialContext.error,
            history: initialContext.history,
            sharedState: initialContext.sharedState,
            sessions: Array.from(initialContext.sessionPool.values()).map((session) => serializeSessionRecord(session)),
            sessionHandles: Array.from(initialContext.threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
            iterations: initialContext.iterations,
        }
        await cleanupSessionPool(initialContext.cwd, initialContext.sessionPool, initialContext.threadSessionHandles)
        return response
    } finally {
        clearActRuntimeAbortRequest(input.actSessionId)
    }
}
