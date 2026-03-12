import { createActor, fromPromise, setup, toPromise, assign } from 'xstate'
import { readAsset } from 'dance-of-tal/lib/registry'
import type { Act } from 'dance-of-tal/data/types'
import { getOpencode } from './opencode.js'
import { buildPromptEnvelope, type ModelSelection } from './prompt.js'
import { buildEnabledToolMap, describeUnavailableRuntimeTools, resolveRuntimeTools } from './runtime-tools.js'
import { normalizeOpencodeError, unwrapOpencodeResult, unwrapPromptResult } from './opencode-errors.js'
import type {
    ActMachineContext,
    ActMachineOutput,
    ActPerformerBindingEvent,
    ActRuntimeEvent,
    ActRuntimeProgressEvent,
    ActSessionLifetime,
    ActSessionMode,
    ActSessionPolicy,
    PendingSessionDirective,
    ResolvedSession,
    RunActRuntimeInput,
    RuntimeAssetRef,
    RuntimeDraftAsset,
    RuntimePerformer,
    SessionRecord,
    StageActInput,
    StageActOrchestratorNode,
    StageActParallelNode,
    StageActWorkerNode,
    StagePerformerInput,
    StepResult,
    ThreadSessionHandleRecord,
    ActThreadResumeSummary,
} from './act-runtime-types.js'

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function runtimeAssetRefKey(ref: RuntimeAssetRef | null | undefined) {
    if (!ref) {
        return null
    }
    return ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
}

function normalizeActSessionMode(mode: ActSessionMode | null | undefined): ActSessionMode {
    return mode === 'default' ? 'default' : 'all_nodes_thread'
}

function resolveNodeSessionSettings(
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

function buildNodeRuntimeConfigKey(
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

const ACT_THREAD_RUNTIME_TTL_MS = 1000 * 60 * 60 * 6
const MAX_THREAD_RUNTIME_RECORDS = 200
const actThreadRuntimeCache = new Map<string, {
    actId: string
    updatedAt: number
    handles: Map<string, ThreadSessionHandleRecord>
}>()
const actRuntimeBindingCache = new Map<string, {
    actId: string
    updatedAt: number
    bindings: Map<string, ActPerformerBindingEvent>
}>()
const actRuntimeSubscribers = new Map<string, Set<(event: ActRuntimeEvent) => void>>()
const actRuntimeAbortRequests = new Map<string, number>()

class ActRuntimeInterruptedError extends Error {
    constructor(message = 'Act run interrupted.') {
        super(message)
        this.name = 'ActRuntimeInterruptedError'
    }
}

function isActRuntimeInterrupted(error: unknown) {
    return error instanceof ActRuntimeInterruptedError
}

function isAbortRequested(actSessionId: string | null | undefined) {
    return !!(actSessionId && actRuntimeAbortRequests.has(actSessionId))
}

function assertActNotAborted(context: Pick<ActMachineContext, 'actSessionId'>) {
    if (isAbortRequested(context.actSessionId)) {
        throw new ActRuntimeInterruptedError()
    }
}

function emitToSubscribers(
    listeners: Set<(event: ActRuntimeEvent) => void>,
    event: ActRuntimeEvent,
) {
    for (const listener of listeners) {
        try {
            listener(event)
        } catch {
            // Ignore subscriber failures and keep the runtime moving.
        }
    }
}

function serializeThreadSessionHandle(session: ThreadSessionHandleRecord) {
    return {
        handle: session.handle,
        nodeId: session.nodeId,
        nodeType: session.nodeType,
        performerId: session.performerId,
        status: session.status,
        turnCount: session.turnCount,
        lastUsedAt: session.lastUsedAt,
        summary: session.summary,
    }
}

function serializeSessionRecord(session: SessionRecord) {
    return {
        scopeKey: session.scopeKey,
        sessionId: session.sessionId,
        policy: session.policy,
        lifetime: session.lifetime,
        nodeId: session.nodeId,
        performerId: session.performerId,
    }
}

function buildResumeSummaryFromContext(context: ActMachineContext): ActThreadResumeSummary {
    return {
        updatedAt: Date.now(),
        runId: context.runId || null,
        currentNodeId: context.currentNodeId,
        finalOutput: context.finalOutput,
        error: context.error,
        iterations: context.iterations,
        nodeOutputs: Object.fromEntries(
            Object.entries(context.nodeOutputs || {})
                .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        ),
        history: [...context.history],
        sessionHandles: Array.from(context.threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
    }
}

function emitActRuntimeProgress(context: ActMachineContext, status: 'running' | 'completed' | 'failed' | 'interrupted') {
    if (!context.actSessionId) {
        return
    }
    const listeners = actRuntimeSubscribers.get(context.actSessionId)
    if (!listeners || listeners.size === 0) {
        return
    }

    const event: ActRuntimeProgressEvent = {
        type: 'act.runtime',
        actSessionId: context.actSessionId,
        actId: context.act.id,
        runId: context.runId,
        status,
        summary: buildResumeSummaryFromContext(context),
    }

    emitToSubscribers(listeners, event)
}

function emitActPerformerBinding(
    context: ActMachineContext,
    sessionId: string,
    node: StageActWorkerNode | StageActOrchestratorNode,
    performer: RuntimePerformer,
) {
    if (!context.actSessionId) {
        return
    }

    const nodeLabel = typeof (node as any).label === 'string' ? (node as any).label : ''
    const event: ActPerformerBindingEvent = {
        type: 'act.performer.binding',
        actSessionId: context.actSessionId,
        actId: context.act.id,
        runId: context.runId,
        sessionId,
        nodeId: node.id,
        nodeLabel: nodeLabel || performer.name || node.id,
        performerId: performer.id || null,
        performerName: performer.name || null,
    }

    const cached = actRuntimeBindingCache.get(context.actSessionId) || {
        actId: context.act.id,
        updatedAt: Date.now(),
        bindings: new Map<string, ActPerformerBindingEvent>(),
    }
    cached.updatedAt = Date.now()
    cached.actId = context.act.id
    cached.bindings.set(sessionId, event)
    actRuntimeBindingCache.set(context.actSessionId, cached)

    const listeners = actRuntimeSubscribers.get(context.actSessionId)
    if (!listeners || listeners.size === 0) {
        return
    }

    emitToSubscribers(listeners, event)
}

export function subscribeActRuntimeEvents(
    actSessionId: string,
    listener: (event: ActRuntimeEvent) => void,
) {
    const listeners = actRuntimeSubscribers.get(actSessionId) || new Set()
    listeners.add(listener)
    actRuntimeSubscribers.set(actSessionId, listeners)

    const cachedBindings = actRuntimeBindingCache.get(actSessionId)
    if (cachedBindings) {
        for (const event of cachedBindings.bindings.values()) {
            emitToSubscribers(new Set([listener]), event)
        }
    }

    return () => {
        const current = actRuntimeSubscribers.get(actSessionId)
        if (!current) {
            return
        }
        current.delete(listener)
        if (current.size === 0) {
            actRuntimeSubscribers.delete(actSessionId)
        }
    }
}

export async function abortActRuntime(actSessionId: string, cwd: string) {
    actRuntimeAbortRequests.set(actSessionId, Date.now())
    const cachedBindings = actRuntimeBindingCache.get(actSessionId)
    const sessionIds = Array.from(new Set(
        Array.from(cachedBindings?.bindings.values() || []).map((binding) => binding.sessionId).filter(Boolean),
    ))
    if (sessionIds.length === 0) {
        return
    }

    const oc = await getOpencode()
    await Promise.all(sessionIds.map(async (sessionId) => {
        try {
            await oc.session.abort({
                sessionID: sessionId,
                directory: cwd,
            })
        } catch {
            // Ignore abort errors; the runtime interrupt flag is the primary stop signal.
        }
    }))
}

function extractTextFromResponse(result: unknown): string {
    const record = result as Record<string, any>
    const structured = record?.data?.info?.structured ?? record?.info?.structured ?? record?.structured
    if (structured && typeof structured === 'object') {
        return JSON.stringify(structured)
    }
    const parts = [
        ...(record?.parts || []),
        ...(record?.data?.parts || []),
        ...(record?.info?.parts || []),
    ]

    const text = parts
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text)
        .join('\n')
        .trim()

    if (text) {
        return text
    }

    if (typeof record?.text === 'string' && record.text.trim()) {
        return record.text.trim()
    }

    return JSON.stringify(result)
}

function extractJsonObject(text: string): string {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i)
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim()
    }

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('Expected JSON object in orchestrator response.')
    }

    return text.slice(start, end + 1)
}

function parseOrchestratorDecision(
    text: string,
    routes: string[],
): { next: string; input: string; session?: { mode: 'fresh' | 'reuse'; handle?: string } } {
    const parsed = JSON.parse(extractJsonObject(text)) as {
        next?: unknown
        input?: unknown
        session?: { mode?: unknown; handle?: unknown }
    }
    const next = typeof parsed.next === 'string' ? parsed.next : ''
    const input = typeof parsed.input === 'string' ? parsed.input : ''
    const allowedRoutes = new Set([...routes, '$exit'])

    if (!allowedRoutes.has(next)) {
        throw new Error(`Orchestrator chose invalid route '${next}'. Allowed routes: ${Array.from(allowedRoutes).join(', ')}`)
    }

    const sessionMode = typeof parsed.session?.mode === 'string' ? parsed.session.mode : undefined
    const sessionHandle = typeof parsed.session?.handle === 'string' ? parsed.session.handle : undefined
    const session = sessionMode === 'fresh'
        ? { mode: 'fresh' as const }
        : sessionMode === 'reuse'
            ? { mode: 'reuse' as const, ...(sessionHandle ? { handle: sessionHandle } : {}) }
            : undefined

    return { next, input, ...(session ? { session } : {}) }
}

function buildOrchestratorFormat(routes: string[]) {
    return {
        type: 'json_schema' as const,
        retryCount: 1,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['next', 'input'],
            properties: {
                next: {
                    type: 'string',
                    enum: [...routes, '$exit'],
                },
                input: {
                    type: 'string',
                },
                session: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['mode'],
                    properties: {
                        mode: {
                            type: 'string',
                            enum: ['fresh', 'reuse'],
                        },
                        handle: {
                            type: 'string',
                        },
                    },
                },
            },
        },
    }
}

function buildOrchestratorPrompt(
    input: string,
    routes: string[],
    availableSessions: ThreadSessionHandleRecord[],
): string {
    const sessionCatalog = availableSessions.length > 0
        ? [
            '',
            'Available reusable session handles for this thread:',
            ...availableSessions.map((session) => (
                `- handle=${session.handle}; node=${session.nodeId}; type=${session.nodeType}; turns=${session.turnCount}; lastUsedAt=${new Date(session.lastUsedAt).toISOString()}; summary=${session.summary || ''}`
            )),
            'If the next node should continue prior memory, respond with session.mode="reuse" and one of the handles for that node.',
            'If the next node should start fresh, respond with session.mode="fresh".',
        ].join('\n')
        : '\nNo reusable session handles are currently available for the allowed routes. Use session.mode="fresh" if you include a session field.'

    return [
        input,
        '',
        'You are an orchestrator. Your role is to read the input above and decide which node should handle it next.',
        'Choose the next route.',
        `Allowed next values: ${[...routes, '$exit'].join(', ')}`,
        sessionCatalog,
        'Respond with JSON only in this exact shape:',
        '{"next":"<nodeId|$exit>","input":"<string>","session":{"mode":"fresh"|"reuse","handle":"<handle when reusing>"}}',
    ].join('\n')
}

function getOutgoingEdges(
    act: StageActInput,
    nodeId: string,
) {
    return act.edges.filter((edge) => edge.from === nodeId)
}

function getOrchestratorRoutes(
    act: StageActInput,
    nodeId: string,
) {
    return getOutgoingEdges(act, nodeId)
        .filter((edge) => edge.role !== 'branch')
        .map((edge) => edge.to)
}

function getParallelBranches(
    act: StageActInput,
    nodeId: string,
) {
    return getOutgoingEdges(act, nodeId)
        .filter((edge) => edge.role === 'branch' && edge.to !== '$exit')
        .map((edge) => edge.to)
}

function selectNextTarget(act: StageActInput, nodeId: string, outcome: 'success' | 'fail'): string | null {
    const edges = getOutgoingEdges(act, nodeId).filter((edge) => edge.role !== 'branch')
    const preferredConditions = outcome === 'success'
        ? ['on_success', 'always', undefined]
        : ['on_fail', 'always', undefined]

    for (const condition of preferredConditions) {
        const match = edges.find((edge) => edge.condition === condition || (!edge.condition && condition === undefined))
        if (match) {
            return match.to
        }
    }

    return null
}

function cloneContext(context: ActMachineContext): ActMachineContext {
    return {
        ...context,
        history: [...context.history],
        sharedState: { ...context.sharedState },
        nodeOutputs: { ...context.nodeOutputs },
        sessionPool: new Map(context.sessionPool),
        threadSessionHandles: new Map(context.threadSessionHandles),
    }
}

function pruneActThreadRuntimeCache() {
    const now = Date.now()
    for (const [sessionId, record] of actThreadRuntimeCache.entries()) {
        if (now - record.updatedAt > ACT_THREAD_RUNTIME_TTL_MS) {
            actThreadRuntimeCache.delete(sessionId)
        }
    }
    for (const [sessionId, record] of actRuntimeBindingCache.entries()) {
        if (now - record.updatedAt > ACT_THREAD_RUNTIME_TTL_MS) {
            actRuntimeBindingCache.delete(sessionId)
        }
    }

    if (actThreadRuntimeCache.size <= MAX_THREAD_RUNTIME_RECORDS) {
        return
    }

    const oldestEntries = [...actThreadRuntimeCache.entries()]
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
        .slice(0, actThreadRuntimeCache.size - MAX_THREAD_RUNTIME_RECORDS)

    for (const [sessionId] of oldestEntries) {
        actThreadRuntimeCache.delete(sessionId)
        actRuntimeBindingCache.delete(sessionId)
    }
}

function getThreadRuntimeHandles(
    actSessionId: string | undefined,
    actId: string,
) {
    pruneActThreadRuntimeCache()

    if (!actSessionId) {
        return new Map<string, ThreadSessionHandleRecord>()
    }

    const existing = actThreadRuntimeCache.get(actSessionId)
    if (existing) {
        existing.updatedAt = Date.now()
        existing.actId = actId
        return new Map(existing.handles)
    }

    const next = {
        actId,
        updatedAt: Date.now(),
        handles: new Map<string, ThreadSessionHandleRecord>(),
    }
    actThreadRuntimeCache.set(actSessionId, next)
    return new Map(next.handles)
}

function persistThreadRuntimeHandles(
    actSessionId: string | undefined,
    actId: string,
    handles: Map<string, ThreadSessionHandleRecord>,
) {
    if (!actSessionId) {
        return
    }
    actThreadRuntimeCache.set(actSessionId, {
        actId,
        updatedAt: Date.now(),
        handles: new Map(handles),
    })
}

function summarizeText(text: string) {
    return text.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function describeActRuntimeError(
    error: unknown,
    context?: { model?: ModelSelection | null },
) {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }

    const normalized = normalizeOpencodeError(error, context?.model ? { model: context.model } : {})
    return normalized.error || normalized.detail || 'OpenCode request failed.'
}

function buildColdStartResumeLines(summary: ActThreadResumeSummary | null | undefined) {
    if (!summary) {
        return []
    }

    const lines = [
        'This act thread was restored after a runtime restart. No live reusable node sessions are currently attached.',
        'Use the following as historical thread context only. Do not assume these previous handles are still reusable unless new live handles are listed separately.',
    ]

    if (summary.finalOutput) {
        lines.push(`Previous final output: ${summarizeText(summary.finalOutput)}`)
    }

    if (summary.error) {
        lines.push(`Previous error: ${summarizeText(summary.error)}`)
    }

    if (summary.currentNodeId) {
        lines.push(`Previous current node: ${summary.currentNodeId}`)
    }

    if (typeof summary.iterations === 'number') {
        lines.push(`Previous iterations: ${summary.iterations}`)
    }

    const nodeOutputs = Object.entries(summary.nodeOutputs || {})
        .filter(([, value]) => typeof value === 'string' && value.trim())
        .slice(0, 6)
    if (nodeOutputs.length > 0) {
        lines.push('Previous node outputs:')
        for (const [nodeId, value] of nodeOutputs) {
            lines.push(`- ${nodeId}: ${summarizeText(value)}`)
        }
    }

    const history = (summary.history || []).slice(-8)
    if (history.length > 0) {
        lines.push('Recent act history:')
        for (const entry of history) {
            lines.push(`- ${entry.nodeId} (${entry.nodeType}): ${entry.action}`)
        }
    }

    const sessionHandles = (summary.sessionHandles || []).slice(0, 6)
    if (sessionHandles.length > 0) {
        lines.push('Previously warm thread handles (historical only):')
        for (const session of sessionHandles) {
            lines.push(`- ${session.handle}; node=${session.nodeId}; type=${session.nodeType}; turns=${session.turnCount}; summary=${session.summary || ''}`)
        }
    }

    return lines
}

function buildActRuntimeSystem(
    context: ActMachineContext,
    node: StageActWorkerNode | StageActOrchestratorNode,
) {
    const lines = [
        '# Runtime Context',
        `Workflow: ${context.act.name}`,
        `Node: ${node.id} (${node.type})`,
        `Turn input: ${summarizeText(context.pendingInput)}`,
    ]

    if (context.actSessionId && context.threadSessionHandles.size === 0) {
        lines.push(...buildColdStartResumeLines(context.resumeSummary))
    }

    return lines.join('\n')
}

function buildInitialSharedState(
    threadSessionHandles: Map<string, ThreadSessionHandleRecord>,
    coldStartResumeSummary: ActThreadResumeSummary | null,
) {
    return {
        sessionHandles: Array.from(threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
        ...(coldStartResumeSummary ? {
            previousThreadSummary: {
                runId: coldStartResumeSummary.runId || null,
                currentNodeId: coldStartResumeSummary.currentNodeId || null,
                finalOutput: coldStartResumeSummary.finalOutput || null,
                error: coldStartResumeSummary.error || null,
                iterations: coldStartResumeSummary.iterations || 0,
            },
        } : {}),
    }
}

function buildPersistentHandle(
    act: StageActInput,
    lifetime: ActSessionLifetime,
    policy: ActSessionPolicy,
    nodeId: string,
    performerId: string | null,
) {
    if (lifetime !== 'thread' || policy === 'fresh') {
        return null
    }
    if (policy === 'node') {
        return `node:${nodeId}:thread`
    }
    if (policy === 'performer') {
        return `performer:${performerId || 'unassigned'}:thread`
    }
    return `act:${act.id}:thread`
}

function listAvailableSessionHandles(
    context: ActMachineContext,
    routes: string[],
) {
    const allowedNodeIds = new Set(routes.filter((route) => route !== '$exit'))
    return Array.from(context.threadSessionHandles.values())
        .filter((handle) => allowedNodeIds.has(handle.nodeId))
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

function stageActFromRegistryAct(act: Act): { stageAct: StageActInput; performers: StagePerformerInput[] } {
    const performerIdByUrn = new Map<string, string>()
    const performers: StagePerformerInput[] = []

    for (const node of Object.values(act.nodes || {})) {
        if ((node.type === 'worker' || node.type === 'orchestrator') && typeof node.performer === 'string') {
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
    }

    const stageAct: StageActInput = {
        id: makeId('act'),
        name: act.name,
        description: act.description,
        sessionMode: 'all_nodes_thread',
        meta: act.type.startsWith('act/') ? { derivedFrom: act.type } : undefined,
        entryNodeId: act.entryNode,
        nodes: Object.entries(act.nodes || {}).map(([id, node]) => {
            if (node.type === 'parallel') {
                return {
                    id,
                    type: 'parallel',
                    position: { x: 28, y: 56 },
                    join: node.join || 'all',
                } satisfies StageActParallelNode
            }
            if (node.type === 'orchestrator') {
                return {
                    id,
                    type: 'orchestrator',
                    performerId: performerIdByUrn.get(node.performer) || null,
                    modelVariant: null,
                    position: { x: 28, y: 56 },
                    maxDelegations: node.maxDelegations,
                    sessionPolicy: 'node',
                    sessionLifetime: 'thread',
                    sessionModeOverride: false,
                } satisfies StageActOrchestratorNode
            }
            return {
                id,
                type: 'worker',
                performerId: performerIdByUrn.get(node.performer) || null,
                modelVariant: null,
                position: { x: 28, y: 56 },
                sessionPolicy: 'fresh',
                sessionLifetime: 'run',
                sessionModeOverride: false,
            } satisfies StageActWorkerNode
        }),
        edges: (act.edges || []).map((edge, index) => ({
            id: `edge-${index + 1}`,
            from: edge.from,
            to: edge.to,
            ...(((edge as { role?: unknown }).role === 'branch') ? { role: 'branch' as const } : {}),
            condition: edge.condition,
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

function normalizeStageActInput(act: StageActInput): StageActInput {
    return {
        ...act,
        sessionMode: normalizeActSessionMode(act.sessionMode),
        nodes: act.nodes.map((node) => {
            if (node.type === 'parallel') {
                return node
            }
            return {
                ...node,
                sessionModeOverride: !!node.sessionModeOverride,
            }
        }),
    }
}

async function resolveActRuntimeInput(input: RunActRuntimeInput): Promise<{
    act: StageActInput
    performers: RuntimePerformer[]
    drafts: Record<string, RuntimeDraftAsset>
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

    const performers = await Promise.all(performerInputs.map((performer) => resolvePerformer(input.cwd, performer)))
    return { act: normalizeStageActInput(stageAct), performers, drafts: input.drafts || {} }
}

function buildSessionScopeKey(
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

async function createSession(cwd: string, title: string) {
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

async function deleteSession(cwd: string, sessionId: string) {
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

async function resolveSession(
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

async function invokePerformer(
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

async function rememberThreadHandle(
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

async function releaseEphemeralSession(cwd: string, session: ResolvedSession, keepAlive: boolean) {
    if (session.ephemeral && !keepAlive) {
        await deleteSession(cwd, session.sessionId)
    }
}

function buildNodeLookup(act: StageActInput) {
    return new Map(act.nodes.map((node) => [node.id, node]))
}

function transitionAfterNode(
    context: ActMachineContext,
    nodeId: string,
    outcome: 'success' | 'fail',
    output: string,
): StepResult {
    const next = selectNextTarget(context.act, nodeId, outcome)
    if (!next || next === '$exit') {
        return {
            status: outcome === 'success' ? 'completed' : 'failed',
            context: {
                ...context,
                currentNodeId: null,
                pendingInput: output,
                finalOutput: output,
            },
        }
    }

    return {
        status: 'continue',
        context: {
            ...context,
            currentNodeId: next,
            pendingInput: output,
        },
    }
}

async function cleanupSessionPool(
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

async function runBranchMachine(
    context: ActMachineContext,
    startNodeId: string,
    input: string,
): Promise<ActMachineOutput> {
    const branchContext: ActMachineContext = {
        ...cloneContext(context),
        runId: `${context.runId}:${startNodeId}`,
        actSessionId: null,
        currentNodeId: startNodeId,
        pendingInput: input,
        iterations: 0,
        history: [],
        nodeOutputs: {},
        sessionPool: new Map(),
        pendingSessionDirective: null,
    }

    const result = await runActMachine(branchContext)
    await cleanupSessionPool(context.cwd, result.context.sessionPool, result.context.threadSessionHandles)
    return result
}

async function advanceRuntimeStep(context: ActMachineContext): Promise<StepResult> {
    const nextContext = cloneContext(context)
    if (isAbortRequested(nextContext.actSessionId)) {
        return {
            status: 'interrupted',
            context: {
                ...nextContext,
                currentNodeId: null,
                error: 'Act run interrupted.',
            },
        }
    }
    if (!nextContext.currentNodeId) {
        return {
            status: 'failed',
            context: {
                ...nextContext,
                error: 'No current Act node selected.',
            },
        }
    }

    if (nextContext.iterations >= nextContext.maxIterations) {
        return {
            status: 'failed',
            context: {
                ...nextContext,
                currentNodeId: null,
                error: `Act exceeded maxIterations (${nextContext.maxIterations}).`,
            },
        }
    }

    const node = buildNodeLookup(nextContext.act).get(nextContext.currentNodeId)
    if (!node) {
        return {
            status: 'failed',
            context: {
                ...nextContext,
                currentNodeId: null,
                error: `Act node not found: ${nextContext.currentNodeId}`,
            },
        }
    }

    nextContext.iterations += 1
    nextContext.sharedState.currentNodeId = node.id
    nextContext.sharedState.iterations = nextContext.iterations
    const timestamp = Date.now()

    if (node.type === 'parallel') {
        const branches = getParallelBranches(nextContext.act, node.id)
        const branchRuns = await Promise.all(branches.map(async (branch) => {
            try {
                const result = await runBranchMachine(nextContext, branch, nextContext.pendingInput)
                return { result }
            } catch (error) {
                return { error: describeActRuntimeError(error) }
            }
        }))

        for (const branch of branchRuns) {
            if (branch.result) {
                nextContext.iterations += branch.result.context.iterations
                nextContext.history.push(...branch.result.context.history)
            }
        }

        const successful = branchRuns.filter((branch) => branch.result?.status === 'completed')
        const failed = branchRuns.filter((branch) => branch.error || branch.result?.status === 'failed')
        const success = node.join === 'any' ? successful.length > 0 : failed.length === 0
        const output = success
            ? (node.join === 'any'
                ? successful[0]?.result?.context.finalOutput || ''
                : successful.map((branch) => branch.result?.context.finalOutput || '').filter(Boolean).join('\n\n'))
            : failed.map((branch) => branch.error || branch.result?.context.error || branch.result?.context.finalOutput || 'Parallel branch failed').join('\n\n')

        nextContext.history.push({
            nodeId: node.id,
            nodeType: 'parallel',
            action: success ? `parallel.completed:${node.join}` : `parallel.failed:${node.join}`,
            timestamp,
        })
        nextContext.nodeOutputs[node.id] = output
        nextContext.sharedState.nodeOutputs = nextContext.nodeOutputs
        return transitionAfterNode(nextContext, node.id, success ? 'success' : 'fail', output)
    }

    const performer = node.performerId ? nextContext.performersById[node.performerId] : null
    if (!performer) {
        const message = `Act node '${node.id}' does not have a resolved performer.`
        nextContext.history.push({
            nodeId: node.id,
            nodeType: node.type,
            action: `${node.type}.failed: ${message}`,
            timestamp,
        })
        return transitionAfterNode(nextContext, node.id, 'fail', message)
    }

    const pendingDirective = nextContext.pendingSessionDirective?.nodeId === node.id
        ? nextContext.pendingSessionDirective
        : null
    nextContext.pendingSessionDirective = null

    if (node.type === 'worker') {
        try {
            const invocation = await invokePerformer(
                nextContext,
                node,
                performer,
                nextContext.pendingInput,
                `Worker: ${node.id}`,
                pendingDirective,
            )
            const output = invocation.output
            const keepAlive = await rememberThreadHandle(nextContext, node, invocation.session, output)
            nextContext.history.push({ nodeId: node.id, nodeType: 'worker', action: 'worker.completed', timestamp })
            nextContext.nodeOutputs[node.id] = output
            nextContext.sharedState.nodeOutputs = nextContext.nodeOutputs
            nextContext.sharedState.sessionHandles = listAvailableSessionHandles(nextContext, nextContext.act.nodes.map((item) => item.id))
            await releaseEphemeralSession(nextContext.cwd, invocation.session, keepAlive)
            return transitionAfterNode(nextContext, node.id, 'success', output)
        } catch (error) {
            if (isActRuntimeInterrupted(error)) {
                return {
                    status: 'interrupted',
                    context: {
                        ...nextContext,
                        currentNodeId: null,
                        error: 'Act run interrupted.',
                    },
                }
            }
            const message = describeActRuntimeError(error, { model: performer.model })
            nextContext.history.push({ nodeId: node.id, nodeType: 'worker', action: `worker.failed: ${message}`, timestamp })
            return transitionAfterNode(nextContext, node.id, 'fail', `Worker '${node.id}' failed: ${message}`)
        }
    }

    // Enforce maxDelegations for orchestrator nodes
    if (typeof node.maxDelegations === 'number' && node.maxDelegations > 0) {
        const priorDelegations = nextContext.history.filter(
            (entry) => entry.nodeId === node.id && entry.action.startsWith('orchestrator.routed:'),
        ).length
        if (priorDelegations >= node.maxDelegations) {
            const message = `Orchestrator '${node.id}' exceeded maxDelegations (${node.maxDelegations}).`
            nextContext.history.push({
                nodeId: node.id,
                nodeType: 'orchestrator',
                action: `orchestrator.failed: ${message}`,
                timestamp,
            })
            return transitionAfterNode(nextContext, node.id, 'fail', message)
        }
    }

    const orchestratorRoutes = getOrchestratorRoutes(nextContext.act, node.id)

    try {
        const invocation = await invokePerformer(
            nextContext,
            node,
            performer,
            buildOrchestratorPrompt(
                nextContext.pendingInput,
                orchestratorRoutes,
                listAvailableSessionHandles(nextContext, orchestratorRoutes),
            ),
            `Orchestrator: ${node.id}`,
            pendingDirective,
        )
        const response = invocation.output
        const decision = parseOrchestratorDecision(response, orchestratorRoutes)
        if (decision.next !== '$exit' && decision.session?.mode === 'reuse') {
            const handle = decision.session.handle?.trim()
            if (!handle) {
                throw new Error(`Orchestrator selected session reuse for '${decision.next}' without a handle.`)
            }
            const handleRecord = nextContext.threadSessionHandles.get(handle)
            if (!handleRecord) {
                throw new Error(`Orchestrator selected unavailable session handle '${handle}'.`)
            }
            if (handleRecord.nodeId !== decision.next) {
                throw new Error(`Session handle '${handle}' belongs to '${handleRecord.nodeId}', not '${decision.next}'.`)
            }
        }
        const keepAlive = await rememberThreadHandle(nextContext, node, invocation.session, response)
        await releaseEphemeralSession(nextContext.cwd, invocation.session, keepAlive)
        nextContext.history.push({
            nodeId: node.id,
            nodeType: 'orchestrator',
            action: `orchestrator.routed:${decision.next}`,
            timestamp,
        })
        nextContext.nodeOutputs[node.id] = decision.input || nextContext.pendingInput
        nextContext.sharedState.nodeOutputs = nextContext.nodeOutputs
        nextContext.sharedState.sessionHandles = listAvailableSessionHandles(nextContext, nextContext.act.nodes.map((item) => item.id))

        if (decision.next === '$exit') {
            return {
                status: 'completed',
                context: {
                    ...nextContext,
                    currentNodeId: null,
                    pendingSessionDirective: null,
                    pendingInput: decision.input || nextContext.pendingInput,
                    finalOutput: decision.input || nextContext.pendingInput,
                },
            }
        }

        return {
            status: 'continue',
            context: {
                ...nextContext,
                currentNodeId: decision.next,
                pendingInput: decision.input || nextContext.pendingInput,
                pendingSessionDirective: decision.next === '$exit' || !decision.session
                    ? null
                    : {
                        nodeId: decision.next,
                        mode: decision.session.mode,
                        ...(decision.session.handle ? { handle: decision.session.handle } : {}),
                    },
            },
        }
    } catch (error) {
        if (isActRuntimeInterrupted(error)) {
            return {
                status: 'interrupted',
                context: {
                    ...nextContext,
                    currentNodeId: null,
                    error: 'Act run interrupted.',
                },
            }
        }
        const message = describeActRuntimeError(error, { model: performer.model })
        nextContext.history.push({
            nodeId: node.id,
            nodeType: 'orchestrator',
            action: `orchestrator.failed: ${message}`,
            timestamp,
        })
        return transitionAfterNode(nextContext, node.id, 'fail', `Orchestrator '${node.id}' failed: ${message}`)
    }
}

const actRuntimeMachine = setup({
    types: {
        context: {} as ActMachineContext,
        input: {} as ActMachineContext,
        output: {} as ActMachineOutput,
    },
    actors: {
        advance: fromPromise(async ({ input }: { input: ActMachineContext }) => advanceRuntimeStep(input)),
    },
}).createMachine({
    id: 'act-runtime',
    initial: 'executing',
    context: ({ input }) => input,
    states: {
        executing: {
            invoke: {
                src: 'advance',
                input: ({ context }) => context,
                onDone: [
                    {
                        guard: ({ event }) => event.output.status === 'continue',
                        actions: assign(({ event }) => event.output.context),
                        target: 'executing',
                        reenter: true,
                    },
                    {
                        guard: ({ event }) => event.output.status === 'completed',
                        actions: assign(({ event }) => event.output.context),
                        target: 'completed',
                    },
                    {
                        guard: ({ event }) => event.output.status === 'interrupted',
                        actions: assign(({ event }) => event.output.context),
                        target: 'interrupted',
                    },
                    {
                        actions: assign(({ event }) => event.output.context),
                        target: 'failed',
                    },
                ],
            },
        },
        completed: {
            type: 'final',
            output: ({ context }) => ({ status: 'completed', context }),
        },
        interrupted: {
            type: 'final',
            output: ({ context }) => ({ status: 'interrupted', context }),
        },
        failed: {
            type: 'final',
            output: ({ context }) => ({ status: 'failed', context }),
        },
    },
})

async function runActMachine(
    input: ActMachineContext,
    onProgress?: (context: ActMachineContext) => void,
): Promise<ActMachineOutput> {
    const actor = createActor(actRuntimeMachine, { input })
    let previousSignature = ''

    actor.subscribe((snapshot) => {
        if (!onProgress) {
            return
        }
        const context = snapshot.context
        const signature = [
            context.currentNodeId || '',
            context.iterations,
            context.history.length,
            context.finalOutput || '',
            context.error || '',
        ].join('::')

        if (signature === previousSignature) {
            return
        }
        previousSignature = signature
        onProgress(context)
    })

    actor.start()
    await toPromise(actor)
    const snapshot = actor.getSnapshot()
    return {
        status: snapshot.value === 'completed'
            ? 'completed'
            : snapshot.value === 'interrupted'
                ? 'interrupted'
                : 'failed',
        context: snapshot.context,
    }
}

export async function runActRuntime(input: RunActRuntimeInput) {
    if (input.actSessionId) {
        actRuntimeAbortRequests.delete(input.actSessionId)
    }
    const resolved = await resolveActRuntimeInput(input)
    const performersById = Object.fromEntries(resolved.performers.map((performer) => [performer.id, performer]))
    const threadSessionHandles = getThreadRuntimeHandles(input.actSessionId, resolved.act.id)
    const coldStartResumeSummary = threadSessionHandles.size === 0 ? input.resumeSummary || null : null
    const initialContext: ActMachineContext = {
        runId: makeId('run'),
        actSessionId: input.actSessionId,
        cwd: input.cwd,
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
        pendingSessionDirective: null,
    }

    emitActRuntimeProgress(initialContext, 'running')
    try {
        const result = await runActMachine(initialContext, (context) => {
            emitActRuntimeProgress(context, 'running')
        })
        persistThreadRuntimeHandles(input.actSessionId, resolved.act.id, result.context.threadSessionHandles)
        emitActRuntimeProgress(result.context, result.status)
        const response = {
            status: result.status,
            currentNodeId: result.context.currentNodeId,
            runId: result.context.runId,
            finalOutput: result.context.finalOutput,
            error: result.context.error,
            history: result.context.history,
            sharedState: result.context.sharedState,
            sessions: Array.from(result.context.sessionPool.values()).map((session) => serializeSessionRecord(session)),
            sessionHandles: Array.from(result.context.threadSessionHandles.values()).map((session) => serializeThreadSessionHandle(session)),
            iterations: result.context.iterations,
        }
        await cleanupSessionPool(initialContext.cwd, result.context.sessionPool, result.context.threadSessionHandles)
        return response
    } finally {
        if (input.actSessionId) {
            actRuntimeAbortRequests.delete(input.actSessionId)
        }
    }
}
