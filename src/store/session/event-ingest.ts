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

export function createEventIngest(options: EventIngestOptions) {
    const { get, set, onHeartbeatTimeout, onSessionIdle, onSessionCompacted } = options

    // ── Buffer & RAF state ──
    let buffer: SSEEvent[] = []
    let rafId: number | null = null
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

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

        for (let i = 0; i < events.length; i++) {
            const event = events[i]
            const type = event.type

            // Coalesce session.status: only keep last per session
            if (type === 'session.status') {
                const sessionId = (event.properties?.sessionID ?? event.properties?.sessionId) as string | undefined
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
                const partKey = `${props.sessionID}:${props.messageID}:${props.partID}`
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
                deltaAccum.clear()
            }

            result.push(event)
        }

        // Apply concatenated deltas back
        for (const [, { idx, delta }] of deltaAccum) {
            const event = result[idx]
            if (event && event.type === 'message.part.delta' && event.properties) {
                event.properties.delta = delta
            }
        }

        // Filter out null entries (coalesced away)
        return result.filter(Boolean)
    }

    // ── Flush (process all buffered events) ──

    function flush() {
        rafId = null
        if (buffer.length === 0) return

        const events = coalesceBuffer(buffer)
        buffer = []

        for (const event of events) {
            processEvent(event)
        }
    }

    // ── Process single event ──

    function processEvent(event: SSEEvent) {
        const type = event.type
        const props = event.properties || {}

        switch (type) {
            case 'message.updated': {
                const info = props.info as { sessionID?: string; id?: string; role?: string; time?: { created?: number } } | undefined
                if (!info?.sessionID || !info?.id || typeof info.role !== 'string') return
                reduceMessageUpdated(info.sessionID, info.id, info.role, info.time?.created, get, set)
                return
            }

            case 'message.removed': {
                const sessionID = props.sessionID as string | undefined
                const messageID = props.messageID as string | undefined
                if (!sessionID || !messageID) return
                reduceMessageRemoved(sessionID, messageID, get, set)
                return
            }

            case 'message.part.updated': {
                const part = props.part as {
                    sessionID?: string; messageID?: string; id?: string
                    type?: string; text?: string; tool?: string; callID?: string
                    state?: { status?: 'pending' | 'running' | 'completed' | 'error'; title?: string; input?: unknown; output?: unknown; error?: unknown; time?: { start: number; end?: number } }
                    reason?: string; cost?: unknown; tokens?: unknown; auto?: boolean; overflow?: unknown
                } | undefined
                if (!part?.sessionID || !part?.messageID || !part?.id) return
                reduceMessagePartUpdated(part.sessionID, part.messageID, { ...part, id: part.id }, get, set)
                return
            }

            case 'message.part.delta': {
                const { sessionID, messageID, partID, field, delta } = props as {
                    sessionID?: string; messageID?: string; partID?: string; field?: string; delta?: string
                }
                if (!sessionID || !messageID || !partID || field !== 'text' || typeof delta !== 'string') return
                reduceMessagePartDelta(sessionID, messageID, partID, delta, get, set)
                return
            }

            case 'message.part.removed': {
                const { sessionID, messageID, partID } = props as { sessionID?: string; messageID?: string; partID?: string }
                if (!sessionID || !messageID || !partID) return
                reduceMessagePartRemoved(sessionID, messageID, partID, get, set)
                return
            }

            case 'session.status': {
                const sessionID = props.sessionID as string | undefined
                const status = props.status as { type?: string; attempt?: number; message?: string } | undefined
                if (!sessionID || !status?.type) return
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
                const sessionID = props.sessionID as string | undefined
                if (!sessionID) return
                reduceSessionStatus(sessionID, { type: 'idle' }, get, set)
                onSessionIdle?.(sessionID)
                return
            }

            case 'session.compacted': {
                const sessionID = props.sessionID as string | undefined
                if (!sessionID) return
                onSessionCompacted?.(sessionID)
                return
            }

            case 'session.error': {
                const sessionID = props.sessionID as string | undefined
                const error = props.error
                if (!sessionID) return
                const errorMessage = extractErrorMessage(error)
                reduceSessionError(sessionID, errorMessage, get, set)
                return
            }

            case 'permission.asked': {
                const request = props as unknown as PermissionRequest
                if (!request?.sessionID || !request?.id) return
                reducePermissionAsked(request.sessionID, request, get, set)
                return
            }

            case 'permission.replied': {
                const replyInfo = props as { sessionID?: string }
                if (!replyInfo?.sessionID) return
                reducePermissionReplied(replyInfo.sessionID, get, set)
                return
            }

            case 'question.asked': {
                const request = props as unknown as QuestionRequest
                if (!request?.sessionID || !request?.id) return
                reduceQuestionAsked(request.sessionID, request, get, set)
                return
            }

            case 'question.replied':
            case 'question.rejected': {
                const replyInfo = props as { sessionID?: string }
                if (!replyInfo?.sessionID) return
                set((state) => {
                    const { [replyInfo.sessionID!]: _, ...rest } = state.seQuestions
                    return { seQuestions: rest }
                })
                return
            }

            case 'todo.updated': {
                const sessionID = props.sessionID as string | undefined
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
            flush()
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
        },

        /** Current buffer size (for testing). */
        get pendingCount() {
            return buffer.length
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
