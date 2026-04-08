/**
 * Event Reducer — Unit Tests (Phase 7.2)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'
import type { StudioState } from '../types'
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

// ── Helpers ──

function createMinimalState(overrides: Partial<StudioState> = {}): StudioState {
    return {
        // Session entity store fields
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

function registerSession(state: StudioState, sessionId: string, chatKey: string) {
    state.sessionToChatKey[sessionId] = chatKey
    state.chatKeyToSession[chatKey] = sessionId
}

/**
 * Create a get/set pair that mutates a shared state object.
 */
function createGetSet(state: StudioState) {
    const get = () => state
    const set = (partial: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => {
        const update = typeof partial === 'function' ? partial(state) : partial
        Object.assign(state, update)
    }
    return { get, set }
}

// ── Tests ──

describe('Event Reducer', () => {
    let state: StudioState
    let get: () => StudioState
    let set: (p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => void

    const SESSION_ID = 'session-1'
    const CHAT_KEY = 'performer-1'

    beforeEach(() => {
        state = createMinimalState()
        registerSession(state, SESSION_ID, CHAT_KEY)
        const gs = createGetSet(state)
        get = gs.get
        set = gs.set
    })

    describe('reduceMessageUpdated', () => {
        it('creates an assistant message if not already present', () => {
            reduceMessageUpdated(SESSION_ID, 'msg-1', 'assistant', 1000, get, set)

            const messages = state.seMessages[SESSION_ID]
            expect(messages).toHaveLength(1)
            expect(messages![0].id).toBe('msg-1')
            expect(messages![0].role).toBe('assistant')
        })

        it('tracks non-assistant roles without forcing them to assistant', () => {
            reduceMessageUpdated(SESSION_ID, 'msg-1', 'user', 1000, get, set)

            const messages = state.seMessages[SESSION_ID]
            expect(messages).toHaveLength(1)
            expect(messages![0]).toMatchObject({
                id: 'msg-1',
                role: 'user',
                content: '',
                timestamp: 1000,
            })
        })

        it('ignores events for unknown sessions', () => {
            reduceMessageUpdated('unknown-session', 'msg-1', 'assistant', 1000, get, set)

            expect(state.seMessages['unknown-session']).toBeUndefined()
        })

        it('reconciles a temp user message with the server message id', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'temp-1', role: 'user', content: 'hello', timestamp: 999 },
            ]

            reduceMessageUpdated(SESSION_ID, 'msg-user-1', 'user', 1000, get, set)

            expect(state.seMessages[SESSION_ID]).toHaveLength(1)
            expect(state.seMessages[SESSION_ID]![0]).toMatchObject({
                id: 'msg-user-1',
                role: 'user',
                content: 'hello',
                timestamp: 1000,
            })
        })
    })

    describe('reduceMessageRemoved', () => {
        it('removes a message by id', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'user', content: 'hello', timestamp: 1000 },
                { id: 'msg-2', role: 'assistant', content: 'hi', timestamp: 1001 },
            ]

            reduceMessageRemoved(SESSION_ID, 'msg-1', get, set)

            const messages = state.seMessages[SESSION_ID]
            expect(messages).toHaveLength(1)
            expect(messages![0].id).toBe('msg-2')
        })
    })

    describe('reduceMessagePartUpdated', () => {
        it('adds a text part to a message', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            reduceMessagePartUpdated(SESSION_ID, 'msg-1', {
                id: 'part-1',
                type: 'text',
                text: 'Hello world',
            }, get, set)

            const msg = state.seMessages[SESSION_ID]![0]
            expect(msg.content).toBe('Hello world')
            expect(msg.parts).toEqual([
                { id: 'part-1', type: 'text', content: 'Hello world' },
            ])
        })

        it('keeps full assistant content when text and tool parts interleave', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            reduceMessagePartUpdated(SESSION_ID, 'msg-1', {
                id: 'text-1',
                type: 'text',
                text: 'Hello',
            }, get, set)
            reduceMessagePartUpdated(SESSION_ID, 'msg-1', {
                id: 'tool-1',
                type: 'tool',
                tool: 'wait_until',
                state: { status: 'completed' },
            }, get, set)
            reduceMessagePartUpdated(SESSION_ID, 'msg-1', {
                id: 'text-2',
                type: 'text',
                text: 'World',
            }, get, set)

            expect(state.seMessages[SESSION_ID]![0]).toMatchObject({
                content: 'Hello\nWorld',
                parts: [
                    { id: 'text-1', type: 'text', content: 'Hello' },
                    { id: 'tool-1', type: 'tool' },
                    { id: 'text-2', type: 'text', content: 'World' },
                ],
            })
        })

        it('adds a reasoning part', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            reduceMessagePartUpdated(SESSION_ID, 'msg-1', {
                id: 'part-1',
                type: 'reasoning',
                text: 'Thinking...',
            }, get, set)

            const msg = state.seMessages[SESSION_ID]![0]
            expect(msg.parts).toHaveLength(1)
            expect(msg.parts![0].type).toBe('reasoning')
            expect(msg.parts![0].content).toBe('Thinking...')
        })

        it('adds a tool part', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            reduceMessagePartUpdated(SESSION_ID, 'msg-1', {
                id: 'part-1',
                type: 'tool',
                tool: 'read_file',
                callID: 'call-1',
                state: { status: 'running', title: 'Reading file' },
            }, get, set)

            const msg = state.seMessages[SESSION_ID]![0]
            expect(msg.parts).toHaveLength(1)
            expect(msg.parts![0].type).toBe('tool')
            expect(msg.parts![0].tool!.name).toBe('read_file')
            expect(msg.parts![0].tool!.status).toBe('running')
        })

        it('preserves tool metadata for rich tool rendering', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: '', timestamp: 1000 },
            ]

            reduceMessagePartUpdated(SESSION_ID, 'msg-1', {
                id: 'part-1',
                type: 'tool',
                tool: 'apply_patch',
                callID: 'call-1',
                state: {
                    status: 'completed',
                    metadata: {
                        files: [
                            {
                                filePath: '/tmp/example.ts',
                                relativePath: 'src/example.ts',
                                type: 'update',
                            },
                        ],
                    },
                },
            }, get, set)

            expect(state.seMessages[SESSION_ID]?.[0]?.parts?.[0]).toMatchObject({
                type: 'tool',
                tool: {
                    metadata: {
                        files: [
                            expect.objectContaining({
                                relativePath: 'src/example.ts',
                            }),
                        ],
                    },
                },
            })
        })

        it('creates message if missing', () => {
            state.seMessages[SESSION_ID] = []

            reduceMessagePartUpdated(SESSION_ID, 'msg-new', {
                id: 'part-1',
                type: 'reasoning',
                text: 'New thought',
            }, get, set)

            expect(state.seMessages[SESSION_ID]).toHaveLength(1)
            expect(state.seMessages[SESSION_ID]![0].id).toBe('msg-new')
        })
    })

    describe('reduceMessagePartDelta', () => {
        it('appends text delta to message content', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-1', role: 'assistant', content: 'Hello', timestamp: 1000 },
            ]

            reduceMessagePartDelta(SESSION_ID, 'msg-1', 'part-1', ' world', get, set)

            expect(state.seMessages[SESSION_ID]![0].content).toBe('Hello world')
            expect(state.seMessages[SESSION_ID]![0].parts).toEqual([
                { id: 'part-1', type: 'text', content: 'Hello world' },
            ])
        })

        it('appends reasoning delta to existing reasoning part', () => {
            state.seMessages[SESSION_ID] = [
                {
                    id: 'msg-1', role: 'assistant', content: '', timestamp: 1000,
                    parts: [{ id: 'part-1', type: 'reasoning', content: 'Think' }],
                },
            ]

            reduceMessagePartDelta(SESSION_ID, 'msg-1', 'part-1', 'ing...', get, set)

            expect(state.seMessages[SESSION_ID]![0].parts![0].content).toBe('Thinking...')
        })

        it('preserves a user role when the matching text part arrives', () => {
            state.seMessages[SESSION_ID] = [
                { id: 'msg-user-1', role: 'user', content: '', timestamp: 1000 },
            ]

            reduceMessagePartUpdated(SESSION_ID, 'msg-user-1', {
                id: 'part-1',
                type: 'text',
                text: 'hello',
            }, get, set)

            expect(state.seMessages[SESSION_ID]![0]).toMatchObject({
                id: 'msg-user-1',
                role: 'user',
                content: 'hello',
            })
        })

        it('keeps text part content when delta arrives before message.updated', () => {
            state.seMessages[SESSION_ID] = []

            reduceMessagePartDelta(SESSION_ID, 'msg-1', 'part-1', 'Hello', get, set)
            reduceMessageUpdated(SESSION_ID, 'msg-1', 'assistant', 1000, get, set)

            expect(state.seMessages[SESSION_ID]).toEqual([
                {
                    id: 'msg-1',
                    role: 'assistant',
                    content: 'Hello',
                    timestamp: 1000,
                    parts: [{ id: 'part-1', type: 'text', content: 'Hello' }],
                },
            ])
        })
    })

    describe('reduceMessagePartRemoved', () => {
        it('removes a part by id', () => {
            state.seMessages[SESSION_ID] = [
                {
                    id: 'msg-1', role: 'assistant', content: '', timestamp: 1000,
                    parts: [
                        { id: 'part-1', type: 'reasoning', content: 'x' },
                        { id: 'part-2', type: 'tool', tool: { name: 'y', callId: 'c', status: 'completed' } },
                    ],
                },
            ]

            reduceMessagePartRemoved(SESSION_ID, 'msg-1', 'part-1', get, set)

            const parts = state.seMessages[SESSION_ID]![0].parts
            expect(parts).toHaveLength(1)
            expect(parts![0].id).toBe('part-2')
        })

        it('recomputes content when removing a text part', () => {
            state.seMessages[SESSION_ID] = [
                {
                    id: 'msg-1',
                    role: 'assistant',
                    content: 'Hello\nWorld',
                    timestamp: 1000,
                    parts: [
                        { id: 'text-1', type: 'text', content: 'Hello' },
                        { id: 'tool-1', type: 'tool', tool: { name: 'wait_until', callId: 'call-1', status: 'completed' } },
                        { id: 'text-2', type: 'text', content: 'World' },
                    ],
                },
            ]

            reduceMessagePartRemoved(SESSION_ID, 'msg-1', 'text-2', get, set)

            expect(state.seMessages[SESSION_ID]![0]).toMatchObject({
                content: 'Hello',
                parts: [
                    { id: 'text-1', type: 'text', content: 'Hello' },
                    { id: 'tool-1', type: 'tool' },
                ],
            })
        })
    })

    describe('reduceSessionStatus', () => {
        it('sets busy status and clears optimistic loading bridge', () => {
            state.sessionLoading[SESSION_ID] = true

            reduceSessionStatus(SESSION_ID, { type: 'busy' }, get, set)

            expect(state.seStatuses[SESSION_ID]!.type).toBe('busy')
            expect(state.sessionLoading[SESSION_ID]).toBeUndefined()
        })

        it('clears loading on idle', () => {
            state.sessionLoading[SESSION_ID] = true

            reduceSessionStatus(SESSION_ID, { type: 'idle' }, get, set)

            expect(state.seStatuses[SESSION_ID]!.type).toBe('idle')
            expect(state.sessionLoading[SESSION_ID]).toBeUndefined()
        })

        it('adds retry system message', () => {
            reduceSessionStatus(SESSION_ID, { type: 'retry', attempt: 2, message: 'Rate limited' }, get, set)

            const msgs = state.seMessages[SESSION_ID] || []
            const retryMsg = msgs.find((m) => m.id === `retry-${SESSION_ID}`)
            expect(retryMsg).toBeDefined()
            expect(retryMsg!.content).toContain('Attempt 2')
        })

        it('updates existing retry message instead of adding duplicate', () => {
            state.seMessages[SESSION_ID] = [
                { id: `retry-${SESSION_ID}`, role: 'system', content: 'old retry', timestamp: 1000 },
            ]

            reduceSessionStatus(SESSION_ID, { type: 'retry', attempt: 3, message: 'Second retry' }, get, set)

            const msgs = state.seMessages[SESSION_ID]!
            const retryMsgs = msgs.filter((m) => m.id === `retry-${SESSION_ID}`)
            expect(retryMsgs).toHaveLength(1)
            expect(retryMsgs[0].content).toContain('Attempt 3')
        })

        it('removes retry message when becoming idle', () => {
            state.seMessages[SESSION_ID] = [
                { id: `retry-${SESSION_ID}`, role: 'system', content: 'retrying...', timestamp: 1000 },
            ]

            reduceSessionStatus(SESSION_ID, { type: 'idle' }, get, set)

            const msgs = state.seMessages[SESSION_ID]!
            expect(msgs.find((m) => m.id === `retry-${SESSION_ID}`)).toBeUndefined()
        })
    })

    describe('reduceSessionError', () => {
        it('adds system error message and clears loading', () => {
            state.sessionLoading[SESSION_ID] = true

            reduceSessionError(SESSION_ID, 'Something went wrong', get, set)

            expect(state.sessionLoading[SESSION_ID]).toBeUndefined()
            expect(state.seStatuses[SESSION_ID]!.type).toBe('error')
            const msgs = state.seMessages[SESSION_ID]!
            expect(msgs[msgs.length - 1].content).toContain('Something went wrong')
        })

        it('marks running tool parts as error', () => {
            state.seMessages[SESSION_ID] = [
                {
                    id: 'msg-1', role: 'assistant', content: '', timestamp: 1000,
                    parts: [
                        { id: 'p1', type: 'tool', tool: { name: 'test', callId: 'c1', status: 'running' } },
                        { id: 'p2', type: 'tool', tool: { name: 'test2', callId: 'c2', status: 'completed' } },
                    ],
                },
            ]

            reduceSessionError(SESSION_ID, 'Crash', get, set)

            const parts = state.seMessages[SESSION_ID]![0].parts!
            expect(parts[0].tool!.status).toBe('error')
            expect(parts[1].tool!.status).toBe('completed')
        })
    })

    describe('reducePermissionAsked', () => {
        it('sets pending permission and clears loading', () => {
            state.sessionLoading[SESSION_ID] = true

            reducePermissionAsked(SESSION_ID, {
                id: 'perm-1', sessionID: SESSION_ID, method: 'test',
            } as unknown as PermissionRequest, get, set)

            expect(state.sePermissions[SESSION_ID]).toBeDefined()
            expect(state.sessionLoading[SESSION_ID]).toBeUndefined()
        })
    })

    describe('reducePermissionReplied', () => {
        it('clears pending permission', () => {
            state.sePermissions[SESSION_ID] = { id: 'perm-1', sessionID: SESSION_ID, metadata: {} } as PermissionRequest

            reducePermissionReplied(SESSION_ID, get, set)

            expect(state.sePermissions[SESSION_ID]).toBeUndefined()
        })
    })

    describe('reduceQuestionAsked', () => {
        it('sets pending question and clears loading', () => {
            state.sessionLoading[SESSION_ID] = true

            reduceQuestionAsked(SESSION_ID, {
                id: 'q-1', sessionID: SESSION_ID,
            } as QuestionRequest, get, set)

            expect(state.seQuestions[SESSION_ID]).toBeDefined()
            expect(state.sessionLoading[SESSION_ID]).toBeUndefined()
        })
    })

        describe('reduceTodoUpdated', () => {
            it('sets todos for sessionId', () => {
            reduceTodoUpdated(SESSION_ID, [{ id: 'todo-1', content: 'Fix bug' }] as unknown as Todo[], get, set)

            expect(state.seTodos[SESSION_ID]).toHaveLength(1)
        })

        it('stores todos only by sessionId', () => {
            reduceTodoUpdated(SESSION_ID, [{ id: 'todo-1', content: 'Fix bug' }] as unknown as Todo[], get, set)

            expect(state.seTodos[CHAT_KEY]).toBeUndefined()
        })
    })

    describe('out-of-order events', () => {
        it('handles part.delta before message.updated', () => {
            // Delta arrives but message doesn't exist yet in seMessages
            state.seMessages[SESSION_ID] = []
            reduceMessagePartDelta(SESSION_ID, 'msg-1', 'part-1', 'Hello', get, set)

            // The delta creates the message with content
            expect(state.seMessages[SESSION_ID]).toHaveLength(1)
            expect(state.seMessages[SESSION_ID]![0].content).toBe('Hello')

            // Then message.updated arrives — should keep existing
            reduceMessageUpdated(SESSION_ID, 'msg-1', 'assistant', 1000, get, set)
            expect(state.seMessages[SESSION_ID]).toHaveLength(1)
            expect(state.seMessages[SESSION_ID]![0].content).toBe('Hello')
        })

        it('handles status transitions busy→retry→busy→idle correctly', () => {
            state.sessionLoading[SESSION_ID] = true
            reduceSessionStatus(SESSION_ID, { type: 'busy' }, get, set)
            expect(state.sessionLoading[SESSION_ID]).toBeUndefined()

            reduceSessionStatus(SESSION_ID, { type: 'retry', attempt: 1, message: 'Error' }, get, set)
            expect(state.seMessages[SESSION_ID]!.some((m) => m.id === `retry-${SESSION_ID}`)).toBe(true)

            reduceSessionStatus(SESSION_ID, { type: 'busy' }, get, set)
            expect(state.seMessages[SESSION_ID]!.some((m) => m.id === `retry-${SESSION_ID}`)).toBe(false)

            reduceSessionStatus(SESSION_ID, { type: 'idle' }, get, set)
            expect(state.sessionLoading[SESSION_ID]).toBeUndefined()
        })
    })
})
