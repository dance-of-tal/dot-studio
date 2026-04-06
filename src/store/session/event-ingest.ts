/**
 * Event Ingest — Phase 2
 *
 * Single entry point for all SSE events from the chat event stream.
 * Replaces the per-event-type if-else chain in integrationSlice.onMessage.
 *
 * Features:
 *   - requestAnimationFrame batched flush (~16ms coalesce window)
 *   - Consecutive session.status events for the same session: keep only last
 *   - Consecutive message.part.delta for the same part: concatenate
 *   - Heartbeat timeout detection with reconnect callback
 */
import type { StudioState } from '../types'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'
import { logChatDebug } from '../../lib/chat-debug'
import {
    reduceMessageUpdated,
    reduceMessageRemoved,
    reduceMessagePartUpdated,
    reduceMessagePartDelta,
    reduceMessagePartRemoved,
    reduceSessionStatus,
    reduceSessionError,
    reducePermissionAsked,
    reducePermissionReplied,
    reduceQuestionAsked,
    reduceTodoUpdated,
} from './event-reducer'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

// ── SSE Event shape (matches OpenCode event protocol) ──

interface SSEEvent {
    type?: string
    properties?: Record<string, unknown>
}

type MessageInfoRecord = {
    sessionID?: string
    sessionId?: string
    id?: string
    role?: string
    time?: { created?: number }
}

type MessagePartRecord = {
    sessionID?: string
    sessionId?: string
    messageID?: string
    messageId?: string
    id?: string
    type?: string
    text?: string
    tool?: string
    callID?: string
    callId?: string
    state?: {
        status?: 'pending' | 'running' | 'completed' | 'error'
        title?: string
        input?: unknown
        output?: unknown
        error?: unknown
        time?: { start: number; end?: number }
    }
    reason?: string
    cost?: unknown
    tokens?: unknown
    auto?: boolean
    overflow?: unknown
}

// ── Ingest Pipeline ──

interface EventIngestOptions {
    get: GetFn
    set: SetFn
    /** Called when heartbeat timeout expires */
    onHeartbeatTimeout?: () => void
    /** Called when session becomes idle (for sync reconciliation) */
    onSessionIdle?: (sessionId: string) => void
    /** Called when session is compacted (for re-sync) */
    onSessionCompacted?: (sessionId: string) => void
}

const HEARTBEAT_TIMEOUT_MS = 30_000
const MAX_EVENTS_PER_FRAME = 100
const FRAME_BUDGET_MS = 8

function readSessionId(record: Record<string, unknown> | null | undefined): string | undefined {
    const sessionId = record?.sessionID ?? record?.sessionId
    return typeof sessionId === 'string' && sessionId ? sessionId : undefined
}

function readMessageId(record: Record<string, unknown> | null | undefined): string | undefined {
    const messageId = record?.messageID ?? record?.messageId
    return typeof messageId === 'string' && messageId ? messageId : undefined
}

function readPartId(record: Record<string, unknown> | null | undefined): string | undefined {
    const partId = record?.partID ?? record?.partId
    return typeof partId === 'string' && partId ? partId : undefined
}

function readMessageInfo(props: Record<string, unknown>): MessageInfoRecord | undefined {
    const info = props.info
    if (!info || typeof info !== 'object') {
        return undefined
    }
    return info as MessageInfoRecord
}

function readMessagePart(props: Record<string, unknown>): MessagePartRecord | undefined {
    const part = props.part
    if (!part || typeof part !== 'object') {
        return undefined
    }
    return part as MessagePartRecord
}

export function createEventIngest(options: EventIngestOptions) {
    const { get, set, onHeartbeatTimeout, onSessionIdle, onSessionCompacted } = options

    // ── Buffer & RAF state ──
    let buffer: SSEEvent[] = []
    let pendingFlushEvents: SSEEvent[] = []
    let rafId: number | null = null
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

    function now() {
        return typeof performance !== 'undefined' ? performance.now() : Date.now()
    }

    // ── Heartbeat tracking ──

    function resetHeartbeat() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer)
        heartbeatTimer = setTimeout(() => {
            onHeartbeatTimeout?.()
        }, HEARTBEAT_TIMEOUT_MS)
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearTimeout(heartbeatTimer)
            heartbeatTimer = null
        }
    }

    // ── Coalesce buffer ──

    function coalesceBuffer(events: SSEEvent[]): SSEEvent[] {
        if (events.length <= 1) return events

        const result: SSEEvent[] = []

        // Track last session.status per sessionId (only keep last)
        const lastStatusIndex = new Map<string, number>()
        // Track contiguous deltas per part key for concatenation
        const deltaAccum = new Map<string, { idx: number; delta: string }>()

        const flushDeltaAccum = () => {
            for (const [, { idx, delta }] of deltaAccum) {
                const event = result[idx]
                if (event && event.type === 'message.part.delta' && event.properties) {
                    event.properties.delta = delta
                }
            }
            deltaAccum.clear()
        }

        for (let i = 0; i < events.length; i++) {
            const event = events[i]
            const type = event.type

            // Coalesce session.status: only keep last per session
            if (type === 'session.status') {
                const sessionId = readSessionId(event.properties)
                if (sessionId) {
                    const prevIdx = lastStatusIndex.get(sessionId)
                    if (prevIdx !== undefined) {
                        // Mark previous as null (will be filtered out)
                        result[prevIdx] = null as unknown as SSEEvent
                    }
                    lastStatusIndex.set(sessionId, result.length)
                }
            }

            // Coalesce message.part.delta: concatenate contiguous deltas for same part
            if (type === 'message.part.delta') {
                const props = event.properties || {}
                const partKey = `${readSessionId(props)}:${readMessageId(props)}:${readPartId(props)}`
                const existing = deltaAccum.get(partKey)
                if (existing !== undefined) {
                    // Extend the accumulated delta
                    existing.delta += (props.delta as string) || ''
                    continue // Don't push to result — we merged into existing
                }

                // First delta for this part — create accumulator
                deltaAccum.set(partKey, { idx: result.length, delta: (props.delta as string) || '' })
            } else {
                // Non-delta event breaks contiguity for all parts
                flushDeltaAccum()
            }

            result.push(event)
        }

        // Apply concatenated deltas back
        flushDeltaAccum()

        // Filter out null entries (coalesced away)
        return result.filter(Boolean)
    }

    // ── Flush (process all buffered events) ──

    function flush() {
        rafId = null
        if (buffer.length > 0) {
            pendingFlushEvents.push(...coalesceBuffer(buffer))
            buffer = []
        }
        if (pendingFlushEvents.length === 0) return

        const startedAt = now()
        let processedCount = 0
        while (
            pendingFlushEvents.length > 0
            && processedCount < MAX_EVENTS_PER_FRAME
            && (now() - startedAt) < FRAME_BUDGET_MS
        ) {
            const event = pendingFlushEvents.shift()
            if (!event) {
                break
            }
            processEvent(event)
            processedCount += 1
        }

        if (pendingFlushEvents.length > 0 || buffer.length > 0) {
            rafId = requestAnimationFrame(flush)
        }
    }

    // ── Process single event ──

    function processEvent(event: SSEEvent) {
        const type = event.type
        const props = event.properties || {}

        switch (type) {
            case 'message.updated': {
                const info = readMessageInfo(props)
                const sessionId = readSessionId(info as Record<string, unknown> | undefined)
                if (!sessionId || !info?.id || typeof info.role !== 'string') return
                reduceMessageUpdated(sessionId, info.id, info.role, info.time?.created, get, set)
                return
            }

            case 'message.removed': {
                const sessionID = readSessionId(props)
                const messageID = readMessageId(props)
                if (!sessionID || !messageID) return
                reduceMessageRemoved(sessionID, messageID, get, set)
                return
            }

            case 'message.part.updated': {
                const part = readMessagePart(props)
                const sessionId = readSessionId(part as Record<string, unknown> | undefined)
                const messageId = readMessageId(part as Record<string, unknown> | undefined)
                if (!sessionId || !messageId || !part?.id) return
                reduceMessagePartUpdated(
                    sessionId,
                    messageId,
                    {
                        ...part,
                        id: part.id,
                        callID: part.callID ?? part.callId,
                    },
                    get,
                    set,
                )
                return
            }

            case 'message.part.delta': {
                const sessionID = readSessionId(props)
                const messageID = readMessageId(props)
                const partID = readPartId(props)
                const field = props.field as string | undefined
                const delta = props.delta as string | undefined
                if (!sessionID || !messageID || !partID || field !== 'text' || typeof delta !== 'string') return
                reduceMessagePartDelta(sessionID, messageID, partID, delta, get, set)
                return
            }

            case 'message.part.removed': {
                const sessionID = readSessionId(props)
                const messageID = readMessageId(props)
                const partID = readPartId(props)
                if (!sessionID || !messageID || !partID) return
                reduceMessagePartRemoved(sessionID, messageID, partID, get, set)
                return
            }

            case 'session.status': {
                const sessionID = readSessionId(props)
                const status = props.status as { type?: string; attempt?: number; message?: string } | undefined
                if (!sessionID || !status?.type) return
                logChatDebug('event-ingest', 'apply session.status', {
                    sessionId: sessionID,
                    status: status.type,
                    attempt: status.attempt,
                    message: status.message,
                })
                reduceSessionStatus(
                    sessionID,
                    { type: status.type as 'idle' | 'busy' | 'error' | 'retry', attempt: status.attempt, message: status.message },
                    get, set,
                )
                if (status.type === 'idle') {
                    onSessionIdle?.(sessionID)
                }
                return
            }

            case 'session.idle': {
                const sessionID = readSessionId(props)
                if (!sessionID) return
                logChatDebug('event-ingest', 'apply session.idle', { sessionId: sessionID })
                reduceSessionStatus(sessionID, { type: 'idle' }, get, set)
                onSessionIdle?.(sessionID)
                return
            }

            case 'session.compacted': {
                const sessionID = readSessionId(props)
                if (!sessionID) return
                logChatDebug('event-ingest', 'apply session.compacted', { sessionId: sessionID })
                onSessionCompacted?.(sessionID)
                return
            }

            case 'session.error': {
                const sessionID = readSessionId(props)
                const error = props.error
                if (!sessionID) return
                const errorMessage = extractErrorMessage(error)
                logChatDebug('event-ingest', 'apply session.error', {
                    sessionId: sessionID,
                    error: errorMessage,
                })
                reduceSessionError(sessionID, errorMessage, get, set)
                return
            }

            case 'permission.asked': {
                const request = props as unknown as PermissionRequest
                const sessionId = readSessionId(request as Record<string, unknown> | undefined)
                if (!sessionId || !request?.id) return
                reducePermissionAsked(sessionId, request, get, set)
                return
            }

            case 'permission.replied': {
                const sessionId = readSessionId(props)
                if (!sessionId) return
                reducePermissionReplied(sessionId, get, set)
                return
            }

            case 'question.asked': {
                const request = props as unknown as QuestionRequest
                const sessionId = readSessionId(request as Record<string, unknown> | undefined)
                if (!sessionId || !request?.id) return
                reduceQuestionAsked(sessionId, request, get, set)
                return
            }

            case 'question.replied':
            case 'question.rejected': {
                const sessionId = readSessionId(props)
                if (!sessionId) return
                set((state) => {
                    const rest = { ...state.seQuestions }
                    delete rest[sessionId]
                    return { seQuestions: rest }
                })
                return
            }

            case 'todo.updated': {
                const sessionID = readSessionId(props)
                const todos = props.todos as Todo[] | undefined
                if (!sessionID || !todos) return
                reduceTodoUpdated(sessionID, todos, get, set)
                return
            }

            default:
                // Unknown event types are silently ignored
                break
        }
    }

    // ── Public API ──

    return {
        /**
         * Enqueue an SSE event for batched processing.
         * Events are coalesced and flushed on the next animation frame.
         */
        enqueue(event: SSEEvent) {
            resetHeartbeat()
            buffer.push(event)
            if (rafId === null) {
                rafId = requestAnimationFrame(flush)
            }
        },

        /**
         * Immediately process all buffered events (for use in tests or cleanup).
         */
        flushSync() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            if (buffer.length > 0) {
                pendingFlushEvents.push(...coalesceBuffer(buffer))
                buffer = []
            }
            while (pendingFlushEvents.length > 0) {
                const event = pendingFlushEvents.shift()
                if (!event) {
                    break
                }
                processEvent(event)
            }
        },

        /**
         * Clean up timers and pending RAF.
         */
        dispose() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            stopHeartbeat()
            buffer = []
            pendingFlushEvents = []
        },

        /** Current buffer size (for testing). */
        get pendingCount() {
            return buffer.length + pendingFlushEvents.length
        },
    }
}

// ── Utility ──

function extractErrorMessage(error: unknown): string {
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
