/**
 * Event Ingest — Unit Tests (Phase 7.1)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { StudioState } from '../types'
import { createEventIngest } from './event-ingest'

// ── Mock RAF ──
let rafCallbacks: Array<() => void> = []
let rafIdCounter = 1

function createMinimalState(overrides: Partial<StudioState> = {}): StudioState {
    return {
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatDrafts: {},
        chatPrefixes: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        activeChatPerformerId: null,
        sessions: [],
        ...overrides,
    } as StudioState
}

describe('Event Ingest', () => {
    let state: StudioState
    let get: () => StudioState
    let set: (p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => void

    const SESSION_ID = 'session-1'

    beforeEach(() => {
        state = createMinimalState()
        state.sessionToChatKey[SESSION_ID] = 'performer-1'
        state.chatKeyToSession['performer-1'] = SESSION_ID

        get = () => state
        set = (partial) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            Object.assign(state, update)
        }

        // Mock RAF to be synchronous
        rafCallbacks = []
        rafIdCounter = 1
        vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
            rafCallbacks.push(cb)
            return rafIdCounter++
        })
        vi.stubGlobal('cancelAnimationFrame', () => {
            // Remove by marking as no-op
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function flushRAF() {
        const callbacks = [...rafCallbacks]
        rafCallbacks = []
        for (const cb of callbacks) cb()
    }

    describe('batched flush', () => {
        it('buffers events and flushes on RAF', () => {
            const ingest = createEventIngest({ get, set })

            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'busy' } },
            })

            // Not yet applied
            expect(state.seStatuses[SESSION_ID]).toBeUndefined()
            expect(ingest.pendingCount).toBe(1)

            // Flush
            flushRAF()

            expect(state.seStatuses[SESSION_ID]?.type).toBe('busy')
            expect(ingest.pendingCount).toBe(0)

            ingest.dispose()
        })

        it('flushSync processes immediately', () => {
            const ingest = createEventIngest({ get, set })

            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'idle' } },
            })

            ingest.flushSync()

            expect(state.seStatuses[SESSION_ID]?.type).toBe('idle')

            ingest.dispose()
        })
    })

    describe('coalescing', () => {
        it('keeps only the last session.status for the same session', () => {
            const ingest = createEventIngest({ get, set })

            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'busy' } },
            })
            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'idle' } },
            })

            ingest.flushSync()

            // Should be idle (last one wins)
            expect(state.seStatuses[SESSION_ID]?.type).toBe('idle')

            ingest.dispose()
        })

        it('concatenates contiguous part deltas for the same part', () => {
            const ingest = createEventIngest({ get, set })

            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            ingest.enqueue({
                type: 'message.part.delta',
                properties: { sessionID: SESSION_ID, messageID: 'msg-1', partID: 'p1', field: 'text', delta: 'Hello' },
            })
            ingest.enqueue({
                type: 'message.part.delta',
                properties: { sessionID: SESSION_ID, messageID: 'msg-1', partID: 'p1', field: 'text', delta: ' world' },
            })

            ingest.flushSync()

            expect(state.seMessages[SESSION_ID]![0].content).toBe('Hello world')

            ingest.dispose()
        })

        it('does not concatenate deltas broken by other events', () => {
            const ingest = createEventIngest({ get, set })

            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            ingest.enqueue({
                type: 'message.part.delta',
                properties: { sessionID: SESSION_ID, messageID: 'msg-1', partID: 'p1', field: 'text', delta: 'Hello' },
            })
            // Some other event type breaks contiguity
            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'busy' } },
            })
            ingest.enqueue({
                type: 'message.part.delta',
                properties: { sessionID: SESSION_ID, messageID: 'msg-1', partID: 'p1', field: 'text', delta: ' world' },
            })

            ingest.flushSync()

            // Both deltas should be applied (but separately since contiguity was broken)
            expect(state.seMessages[SESSION_ID]![0].content).toBe('Hello world')

            ingest.dispose()
        })

        it('flushes an accumulated delta before a non-delta event resets the group', () => {
            const ingest = createEventIngest({ get, set })

            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            ingest.enqueue({
                type: 'message.part.delta',
                properties: { sessionID: SESSION_ID, messageID: 'msg-1', partID: 'p1', field: 'text', delta: 'Hello' },
            })
            ingest.enqueue({
                type: 'message.part.delta',
                properties: { sessionID: SESSION_ID, messageID: 'msg-1', partID: 'p1', field: 'text', delta: ' world' },
            })
            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'busy' } },
            })

            ingest.flushSync()

            expect(state.seMessages[SESSION_ID]![0].content).toBe('Hello world')
            expect(state.seStatuses[SESSION_ID]?.type).toBe('busy')

            ingest.dispose()
        })

        it('accepts camelCase message event fields for streaming output', () => {
            const ingest = createEventIngest({ get, set })

            ingest.enqueue({
                type: 'message.updated',
                properties: {
                    info: {
                        sessionId: SESSION_ID,
                        id: 'msg-1',
                        role: 'assistant',
                        time: { created: 1000 },
                    },
                },
            })
            ingest.enqueue({
                type: 'message.part.delta',
                properties: {
                    sessionId: SESSION_ID,
                    messageId: 'msg-1',
                    partId: 'p1',
                    field: 'text',
                    delta: 'Hello',
                },
            })
            ingest.enqueue({
                type: 'message.part.updated',
                properties: {
                    part: {
                        sessionId: SESSION_ID,
                        messageId: 'msg-1',
                        id: 'tool-1',
                        type: 'tool',
                        tool: 'wait_until',
                        callId: 'call-1',
                        state: { status: 'completed' },
                    },
                },
            })
            ingest.enqueue({
                type: 'message.part.removed',
                properties: {
                    sessionId: SESSION_ID,
                    messageId: 'msg-1',
                    partId: 'tool-1',
                },
            })

            ingest.flushSync()

            expect(state.seMessages[SESSION_ID]?.[0]?.content).toBe('Hello')
            expect(state.seMessages[SESSION_ID]?.[0]?.parts).toEqual([
                { id: 'p1', type: 'text', content: 'Hello' },
            ])

            ingest.dispose()
        })
    })

    describe('heartbeat timeout', () => {
        it('calls onHeartbeatTimeout when no events for 30s', () => {
            vi.useFakeTimers()
            const onHeartbeatTimeout = vi.fn()
            const ingest = createEventIngest({ get, set, onHeartbeatTimeout })

            // Send one event to start the heartbeat timer
            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'busy' } },
            })

            // Advance almost to timeout
            vi.advanceTimersByTime(29_999)
            expect(onHeartbeatTimeout).not.toHaveBeenCalled()

            // Advance past timeout
            vi.advanceTimersByTime(2)
            expect(onHeartbeatTimeout).toHaveBeenCalledOnce()

            ingest.dispose()
            vi.useRealTimers()
        })

        it('resets heartbeat timer on each event', () => {
            vi.useFakeTimers()
            const onHeartbeatTimeout = vi.fn()
            const ingest = createEventIngest({ get, set, onHeartbeatTimeout })

            ingest.enqueue({ type: 'session.status', properties: { sessionID: SESSION_ID, status: { type: 'busy' } } })

            // Advance part way
            vi.advanceTimersByTime(20_000)

            // Send another event — resets timer
            ingest.enqueue({ type: 'session.status', properties: { sessionID: SESSION_ID, status: { type: 'idle' } } })

            // Advance past original timeout
            vi.advanceTimersByTime(11_000)
            expect(onHeartbeatTimeout).not.toHaveBeenCalled()

            // Advance to new timeout
            vi.advanceTimersByTime(20_000)
            expect(onHeartbeatTimeout).toHaveBeenCalledOnce()

            ingest.dispose()
            vi.useRealTimers()
        })
    })

    describe('session idle callback', () => {
        it('calls onSessionIdle when session becomes idle', () => {
            const onSessionIdle = vi.fn()
            const ingest = createEventIngest({ get, set, onSessionIdle })

            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'idle' } },
            })
            ingest.flushSync()

            expect(onSessionIdle).toHaveBeenCalledWith(SESSION_ID)

            ingest.dispose()
        })

        it('calls onSessionIdle on session.idle event', () => {
            const onSessionIdle = vi.fn()
            const ingest = createEventIngest({ get, set, onSessionIdle })

            ingest.enqueue({
                type: 'session.idle',
                properties: { sessionID: SESSION_ID },
            })
            ingest.flushSync()

            expect(onSessionIdle).toHaveBeenCalledWith(SESSION_ID)

            ingest.dispose()
        })
    })

    describe('duplicate event harmlessness', () => {
        it('applying same session.status twice yields consistent state', () => {
            const ingest = createEventIngest({ get, set })

            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'busy' } },
            })
            ingest.flushSync()

            const stateAfterFirst = { ...state.seStatuses }

            ingest.enqueue({
                type: 'session.status',
                properties: { sessionID: SESSION_ID, status: { type: 'busy' } },
            })
            ingest.flushSync()

            expect(state.seStatuses).toEqual(stateAfterFirst)

            ingest.dispose()
        })
    })

    describe('unknown events', () => {
        it('silently ignores unknown event types', () => {
            const ingest = createEventIngest({ get, set })

            ingest.enqueue({
                type: 'some.unknown.event',
                properties: { foo: 'bar' },
            })

            expect(() => ingest.flushSync()).not.toThrow()

            ingest.dispose()
        })
    })
})
