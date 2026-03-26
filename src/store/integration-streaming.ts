import type { ChatMessage, ChatMessagePart } from '../types'
import type { StudioState } from './types'
import { queryClient } from '../lib/query-client'
import { upsertAssistantStreamingMessage } from '../lib/chat-messages'

export let eventSourceInstance: EventSource | null = null
export let eventSourceWorkingDir: string | null = null
export let adapterEventSourceInstance: EventSource | null = null
export let adapterEventSourceWorkingDir: string | null = null
export const streamingTextParts = new Map<string, Map<string, string>>()
export const streamingReasoningParts = new Map<string, Map<string, string>>()
export const streamingMessageRoles = new Map<string, 'user' | 'assistant' | 'system'>()
export const streamingPartKinds = new Map<string, 'text' | 'reasoning'>()
export const syncingSessions = new Set<string>()

export function setEventSourceInstance(next: EventSource | null) {
    eventSourceInstance = next
}

export function setEventSourceWorkingDir(next: string | null) {
    eventSourceWorkingDir = next
}

export function setAdapterEventSourceInstance(next: EventSource | null) {
    adapterEventSourceInstance = next
}

export function setAdapterEventSourceWorkingDir(next: string | null) {
    adapterEventSourceWorkingDir = next
}

export function diagnosticMatchesWorkingDir(uri: string, workingDir: string) {
    if (!workingDir) {
        return true
    }

    try {
        if (uri.startsWith('file://')) {
            const filePath = decodeURIComponent(new URL(uri).pathname)
            return filePath.startsWith(workingDir)
        }
    } catch {
        return false
    }

    return uri.includes(workingDir)
}

export function streamingKey(sessionId: string, messageId: string) {
    return `${sessionId}:${messageId}`
}

export function streamingPartKey(sessionId: string, messageId: string, partId: string) {
    return `${sessionId}:${messageId}:${partId}`
}

export function streamingMessageKey(sessionId: string, messageId: string) {
    return `${sessionId}:${messageId}`
}

export function clearStreamingSession(sessionId: string) {
    for (const key of streamingTextParts.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingTextParts.delete(key)
        }
    }

    for (const key of streamingReasoningParts.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingReasoningParts.delete(key)
        }
    }

    for (const key of streamingMessageRoles.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingMessageRoles.delete(key)
        }
    }

    for (const key of streamingPartKinds.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingPartKinds.delete(key)
        }
    }
}

function performerIdForSession(sessionMap: Record<string, string>, sessionId: string): string | null {
    for (const [performerId, mappedSessionId] of Object.entries(sessionMap)) {
        if (mappedSessionId === sessionId) {
            return performerId
        }
    }
    return null
}

export type SessionStreamTarget =
    | { kind: 'performer'; performerId: string }
    | { kind: 'act-participant'; chatKey: string }

export function resolveSessionTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
    // All sessions (performer + assistant) are in sessionMap
    const performerId = performerIdForSession(state.sessionMap, sessionId)
    if (performerId) {
        if (performerId.startsWith('act:')) {
            return { kind: 'act-participant', chatKey: performerId }
        }
        return { kind: 'performer', performerId }
    }

    return null
}

// ── Lazy session resolution for wake-cascade sessions ────────────
// When SSE events arrive for sessions not in sessionMap (e.g., auto-created
// by wake cascade), this resolves them asynchronously from the backend and
// registers them so subsequent events are correctly routed to the UI.

const pendingResolves = new Set<string>()
const failedResolves = new Map<string, number>()
const FAILED_RESOLVE_RETRY_MS = 2_000

function parseActParticipantOwnerId(ownerId: string) {
    const match = ownerId.match(/^act:([^:]+):thread:([^:]+):participant:(.+)$/)
    if (!match) {
        return null
    }

    const [, actId, threadId, participantKey] = match
    return { actId, threadId, participantKey }
}

/**
 * Attempt to lazily resolve and register an unknown session.
 * Called when resolveSessionTarget returns null for an SSE event.
 * Non-blocking: fires async API call, updates sessionMap on success.
 * After registration, calls onResolved to sync existing messages.
 */
export function tryLazyResolveSession(
    sessionId: string,
    set: (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void,
    get: () => StudioState,
    onResolved?: (target: SessionStreamTarget, sessionId: string) => void,
): void {
    const failedAt = failedResolves.get(sessionId)
    if (failedAt && (Date.now() - failedAt) < FAILED_RESOLVE_RETRY_MS) {
        return
    }
    // Skip if already pending
    if (pendingResolves.has(sessionId)) return
    // Skip if already in sessionMap (race condition)
    if (performerIdForSession(get().sessionMap, sessionId)) return

    pendingResolves.add(sessionId)

    import('../api').then(({ api }) => {
        api.chat.resolveSession(sessionId).then((result) => {
            pendingResolves.delete(sessionId)
            if (result.found && result.ownerId) {
                failedResolves.delete(sessionId)
                const actOwner = parseActParticipantOwnerId(result.ownerId)
                // Register in sessionMap so subsequent events are routed
                set((state) => ({
                    sessionMap: { ...state.sessionMap, [result.ownerId]: sessionId },
                    ...(actOwner
                        ? {
                            actThreads: {
                                ...state.actThreads,
                                [actOwner.actId]: (state.actThreads[actOwner.actId] || []).map((thread) =>
                                    thread.id !== actOwner.threadId
                                        ? thread
                                        : {
                                            ...thread,
                                            participantSessions: {
                                                ...thread.participantSessions,
                                                [actOwner.participantKey]: sessionId,
                                            },
                                        },
                                ),
                            },
                        }
                        : {}),
                }))
                console.log(`[lazy-resolve] Registered session ${sessionId} → ${result.ownerId}`)

                // Immediately sync existing messages so content appears right away
                // (SSE events before registration were lost)
                const target = resolveSessionTarget(get(), sessionId)
                if (target && onResolved) {
                    onResolved(target, sessionId)
                }
            } else {
                failedResolves.set(sessionId, Date.now())
            }
        }).catch(() => {
            pendingResolves.delete(sessionId)
            failedResolves.set(sessionId, Date.now())
        })
    }).catch(() => {
        pendingResolves.delete(sessionId)
    })
}


export function updateTargetMessages(
    state: StudioState,
    target: SessionStreamTarget,
    updater: (messages: ChatMessage[]) => ChatMessage[],
) {
    if (target.kind === 'performer') {
        return {
            chats: {
                ...state.chats,
                [target.performerId]: updater(state.chats[target.performerId] || []),
            },
        }
    }

    if (target.kind === 'act-participant') {
        return {
            chats: {
                ...state.chats,
                [target.chatKey]: updater(state.chats[target.chatKey] || []),
            },
        }
    }

    return {}
}

export function invalidateRuntimeQueries(workingDir: string) {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers', workingDir] })
    queryClient.invalidateQueries({ queryKey: ['runtime-tools', workingDir] })
}

export function resolveEventSessionContext(
    state: StudioState,
    sessionId: string | null | undefined,
): { sessionId: string; target: SessionStreamTarget } | null {
    if (!sessionId) {
        return null
    }
    const target = resolveSessionTarget(state, sessionId)
    if (!target) {
        return null
    }
    return { sessionId, target }
}

export function streamingPartContent(
    store: Map<string, Map<string, string>>,
    sessionId: string,
    messageId: string,
) {
    return Array.from((store.get(streamingKey(sessionId, messageId)) || new Map()).values()).join('\n').trim()
}

export function updateStreamingPartStore(
    store: Map<string, Map<string, string>>,
    sessionId: string,
    messageId: string,
    partId: string,
    nextValue: string,
) {
    const key = streamingKey(sessionId, messageId)
    const partMap = store.get(key) || new Map<string, string>()
    partMap.set(partId, nextValue)
    store.set(key, partMap)
    return key
}

export function removeStreamingPartStoreEntry(
    store: Map<string, Map<string, string>>,
    sessionId: string,
    messageId: string,
    partId: string,
) {
    const key = streamingKey(sessionId, messageId)
    const partMap = store.get(key)
    if (partMap) {
        partMap.delete(partId)
        if (partMap.size === 0) {
            store.delete(key)
        }
    }
    return key
}

export function applyTargetMessageUpdate(
    set: (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void,
    target: SessionStreamTarget,
    updater: (messages: ChatMessage[]) => ChatMessage[],
) {
    set((state: StudioState) => updateTargetMessages(state, target, updater))
}

export function upsertStreamingAssistant(
    messages: ChatMessage[],
    messageId: string,
    content: string,
    timestamp = Date.now(),
) {
    return upsertAssistantStreamingMessage(messages, messageId, content, timestamp)
}

export function upsertMessagePart(
    messages: ChatMessage[],
    messageId: string,
    part: ChatMessagePart,
): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((message) => message.id === messageId)
    if (idx === -1) {
        next.push({
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            parts: [part],
        })
        return next
    }

    const message = next[idx]
    const existingParts = message.parts ? [...message.parts] : []
    const partIdx = existingParts.findIndex((existingPart) => existingPart.id === part.id)
    if (partIdx === -1) {
        existingParts.push(part)
    } else {
        existingParts[partIdx] = part
    }
    next[idx] = { ...message, parts: existingParts }
    return next
}

export function removeMessagePart(
    messages: ChatMessage[],
    messageId: string,
    partId: string,
): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((message) => message.id === messageId)
    if (idx === -1) {
        return next
    }

    const message = next[idx]
    if (!message.parts?.length) {
        return next
    }

    const remainingParts = message.parts.filter((part) => part.id !== partId)
    next[idx] = { ...message, parts: remainingParts }
    return next
}

export function extractEventErrorMessage(error: unknown): string {
    const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null
    const dataRecord = errorRecord?.data && typeof errorRecord.data === 'object'
        ? errorRecord.data as Record<string, unknown>
        : null
    if (typeof dataRecord?.message === 'string' && dataRecord.message.trim()) {
        return dataRecord.message.trim()
    }
    if (typeof errorRecord?.message === 'string' && errorRecord.message.trim()) {
        return errorRecord.message.trim()
    }
    try {
        return `OpenCode session failed: ${JSON.stringify(error)}`
    } catch {
        return 'OpenCode session failed.'
    }
}

export function clearIntegrationStreamingState() {
    streamingTextParts.clear()
    streamingReasoningParts.clear()
    streamingMessageRoles.clear()
    streamingPartKinds.clear()
    syncingSessions.clear()
}
