import { getOpencode } from './opencode.js'
import type {
    ActMachineContext,
    ActPerformerBindingEvent,
    ActRuntimeEvent,
    ActRuntimeProgressEvent,
    SessionRecord,
    StageActOrchestratorNode,
    StageActWorkerNode,
    ThreadSessionHandleRecord,
    ActThreadResumeSummary,
} from './act-runtime-types.js'

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

export class ActRuntimeInterruptedError extends Error {
    constructor(message = 'Act run interrupted.') {
        super(message)
        this.name = 'ActRuntimeInterruptedError'
    }
}

export function isActRuntimeInterrupted(error: unknown) {
    return error instanceof ActRuntimeInterruptedError
}

export function isAbortRequested(actSessionId: string | null | undefined) {
    return !!(actSessionId && actRuntimeAbortRequests.has(actSessionId))
}

export function assertActNotAborted(context: Pick<ActMachineContext, 'actSessionId'>) {
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

export function serializeThreadSessionHandle(session: ThreadSessionHandleRecord) {
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

export function serializeSessionRecord(session: SessionRecord) {
    return {
        scopeKey: session.scopeKey,
        sessionId: session.sessionId,
        policy: session.policy,
        lifetime: session.lifetime,
        nodeId: session.nodeId,
        performerId: session.performerId,
    }
}

export function buildResumeSummaryFromContext(context: ActMachineContext): ActThreadResumeSummary {
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

export function emitActRuntimeProgress(context: ActMachineContext, status: 'running' | 'completed' | 'failed' | 'interrupted') {
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

export function emitActPerformerBinding(
    context: ActMachineContext,
    sessionId: string,
    node: StageActWorkerNode | StageActOrchestratorNode,
    performer: { id: string; name: string },
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

export function getThreadRuntimeHandles(
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

export function persistThreadRuntimeHandles(
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

export function clearActRuntimeAbortRequest(actSessionId: string | undefined) {
    if (actSessionId) {
        actRuntimeAbortRequests.delete(actSessionId)
    }
}
