import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import type { ChatRuntimeConfig } from './chat-runtime-target'
import { createChatSendActions } from './chat-send-actions'
import { createEmptyProjectionDirtyState } from '../runtime-change-policy'

const {
    sendMock,
    statusMock,
    messagesMock,
    syncChatMessagesMock,
    resolveChatRuntimeTargetMock,
} = vi.hoisted(() => ({
    sendMock: vi.fn(),
    statusMock: vi.fn(),
    messagesMock: vi.fn(),
    syncChatMessagesMock: vi.fn(),
    resolveChatRuntimeTargetMock: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        chat: {
            send: sendMock,
            status: statusMock,
            messages: messagesMock,
        },
    },
}))

vi.mock('../../lib/api-errors', () => ({
    formatStudioApiErrorMessage: () => 'request failed',
}))

vi.mock('../../lib/performers', () => ({
    hasModelConfig: () => true,
}))

vi.mock('./chat-internals', () => ({
    appendChatMessage: vi.fn(),
    appendChatSystemMessage: vi.fn(),
    syncChatMessages: syncChatMessagesMock,
}))

vi.mock('./chat-runtime-target', async () => {
    const actual = await vi.importActual<typeof import('./chat-runtime-target')>('./chat-runtime-target')
    return {
        ...actual,
        resolveChatRuntimeTarget: resolveChatRuntimeTargetMock,
    }
})

function createRuntimeConfig(): ChatRuntimeConfig {
    return {
        talRef: null,
        danceRefs: [],
        model: { provider: 'openai', modelId: 'gpt-5.4' },
        modelVariant: null,
        agentId: 'build',
        mcpServerNames: [],
        planMode: false,
    }
}

function createPerformerTarget(chatKey = 'performer-1') {
    return {
        chatKey,
        kind: 'performer' as const,
        name: 'Performer 1',
        runtimeConfig: createRuntimeConfig(),
        assistantContext: null,
        executionScope: {
            performerId: chatKey,
            actId: null,
            clearPerformerIds: [chatKey],
            clearActIds: [],
        },
        requestTarget: {
            performerId: chatKey,
            performerName: 'Performer 1',
        },
    }
}

function createActTarget(chatKey: string, actId: string, threadId: string) {
    return {
        chatKey,
        kind: 'act-participant' as const,
        name: 'Lead',
        runtimeConfig: createRuntimeConfig(),
        assistantContext: null,
        executionScope: {
            performerId: 'local-performer',
            actId,
            clearPerformerIds: ['local-performer'],
            clearActIds: [actId],
        },
        requestTarget: {
            performerId: chatKey,
            performerName: 'Lead',
            actId,
            actThreadId: threadId,
        },
    }
}

function createMinimalState(overrides: Partial<StudioState> = {}): StudioState {
    const state = {
        runtimeReloadPending: false,
        projectionDirty: createEmptyProjectionDirtyState(),
        workspaceDirty: false,
        workingDir: '/tmp/workspace',
        performers: [],
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
        actThreads: {},
        ...overrides,
    } as unknown as StudioState

    state.applyPendingRuntimeReload = vi.fn(async () => true)
    state.clearSessionRevert = vi.fn()
    state.clearProjectionDirty = vi.fn()
    state.appendSessionMessage = vi.fn()
    state.removeSessionMessage = vi.fn()
    state.registerBinding = vi.fn((chatKey: string, sessionId: string) => {
        state.chatKeyToSession[chatKey] = sessionId
        state.sessionToChatKey[sessionId] = chatKey
    })
    state.clearChatDraftMessages = vi.fn((chatKey: string) => {
        delete state.chatDrafts[chatKey]
    })
    state.upsertSession = vi.fn()
    state.setSessionMessages = vi.fn((sessionId: string, messages: unknown[]) => {
        state.seMessages[sessionId] = messages as StudioState['seMessages'][string]
    })
    state.setSessionLoading = vi.fn((sessionId: string, loading: boolean) => {
        if (loading) {
            state.sessionLoading[sessionId] = true
            return
        }
        delete state.sessionLoading[sessionId]
    })
    state.setSessionStatus = vi.fn((sessionId: string, status: unknown) => {
        state.seStatuses[sessionId] = status as StudioState['seStatuses'][string]
    })
    state.saveWorkspace = vi.fn(async () => {})

    return state
}

describe('chat send actions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sendMock.mockReset()
        statusMock.mockReset()
        messagesMock.mockReset()
        syncChatMessagesMock.mockReset()
        resolveChatRuntimeTargetMock.mockReset()
    })

    it('recovers session messages while status is still busy', async () => {
        const sessionId = 'session-1'
        const state = createMinimalState({
            chatKeyToSession: { 'performer-1': sessionId },
            sessionToChatKey: { [sessionId]: 'performer-1' },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createPerformerTarget())
        sendMock.mockResolvedValue(undefined)
        statusMock.mockResolvedValue({ status: { type: 'busy' } })
        syncChatMessagesMock.mockImplementation(async () => {
            state.sessionLoading[sessionId] = false
            return { messages: [], nextCursor: null }
        })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createPerformerTarget().runtimeConfig,
        }))

        await actions.sendMessage('performer-1', 'hello')
        await vi.advanceTimersByTimeAsync(2200)

        expect(statusMock).toHaveBeenCalledWith(sessionId)
        expect(syncChatMessagesMock).toHaveBeenCalledWith(set, get, 'performer-1', sessionId)
    })

    it('settles stale busy status after assistant output stops changing', async () => {
        const sessionId = 'session-1'
        const state = createMinimalState({
            chatKeyToSession: { 'performer-1': sessionId },
            sessionToChatKey: { [sessionId]: 'performer-1' },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createPerformerTarget())
        sendMock.mockResolvedValue(undefined)
        statusMock.mockResolvedValue({ status: { type: 'busy' } })
        syncChatMessagesMock.mockResolvedValue({
            messages: [
                { id: 'user-1', role: 'user', content: 'hello', timestamp: 1000 },
                { id: 'msg-1', role: 'assistant', content: 'done', timestamp: 1001 },
            ],
            nextCursor: null,
        })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createPerformerTarget().runtimeConfig,
        }))

        await actions.sendMessage('performer-1', 'hello')
        await vi.advanceTimersByTimeAsync(3400)

        expect(state.setSessionStatus).toHaveBeenCalledWith(sessionId, { type: 'idle' })
        expect(state.sessionLoading[sessionId]).toBeUndefined()
        expect(state.seStatuses[sessionId]).toEqual({ type: 'idle' })
    })

    it('reloads act thread sessions during streaming recovery for act chats', async () => {
        const actId = 'act-1'
        const threadId = 'thread-1'
        const participantKey = 'participant-1'
        const chatKey = `act:${actId}:thread:${threadId}:participant:${participantKey}`
        const sessionId = 'session-1'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
            loadThreads: vi.fn(async () => {}),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createActTarget(chatKey, actId, threadId))
        sendMock.mockResolvedValue(undefined)
        statusMock.mockResolvedValue({ status: { type: 'busy' } })
        messagesMock.mockResolvedValue({ messages: [], nextCursor: null })
        syncChatMessagesMock.mockImplementation(async () => {
            delete state.sessionLoading[sessionId]
            return { messages: [], nextCursor: null }
        })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createActTarget(chatKey, actId, threadId).runtimeConfig,
        }))

        await actions.sendActMessage(actId, threadId, participantKey, 'hello')
        await vi.advanceTimersByTimeAsync(2200)

        expect(state.loadThreads).toHaveBeenCalledWith(actId)
        expect(syncChatMessagesMock).toHaveBeenCalledWith(set, get, chatKey, sessionId)
    })

    it('syncs discovered act participant session status during streaming recovery', async () => {
        const actId = 'act-1'
        const threadId = 'thread-1'
        const participantKey = 'participant-1'
        const downstreamKey = 'participant-2'
        const chatKey = `act:${actId}:thread:${threadId}:participant:${participantKey}`
        const downstreamChatKey = `act:${actId}:thread:${threadId}:participant:${downstreamKey}`
        const sessionId = 'session-1'
        const downstreamSessionId = 'session-2'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            actThreads: {
                [actId]: [{
                    id: threadId,
                    actId,
                    status: 'active',
                    participantSessions: {
                        [participantKey]: sessionId,
                    },
                    createdAt: Date.now(),
                }],
            },
            initRealtimeEvents: vi.fn(),
            loadThreads: vi.fn(async () => {
                state.actThreads[actId] = [{
                    id: threadId,
                    actId,
                    status: 'active',
                    participantSessions: {
                        [participantKey]: sessionId,
                        [downstreamKey]: downstreamSessionId,
                    },
                    createdAt: Date.now(),
                }]
                state.chatKeyToSession[downstreamChatKey] = downstreamSessionId
                state.sessionToChatKey[downstreamSessionId] = downstreamChatKey
            }),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createActTarget(chatKey, actId, threadId))
        sendMock.mockResolvedValue(undefined)
        statusMock.mockImplementation(async () => ({
            status: { type: 'busy' as const },
        }))
        messagesMock.mockResolvedValue({ messages: [], nextCursor: null })
        syncChatMessagesMock.mockResolvedValue({ messages: [], nextCursor: null })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createActTarget(chatKey, actId, threadId).runtimeConfig,
        }))

        await actions.sendActMessage(actId, threadId, participantKey, 'hello')
        await vi.advanceTimersByTimeAsync(2200)

        expect(state.setSessionStatus).toHaveBeenCalledWith(downstreamSessionId, { type: 'busy' })
        expect(state.setSessionLoading).toHaveBeenCalledWith(downstreamSessionId, false)
        expect(state.chatKeyToSession[downstreamChatKey]).toBe(downstreamSessionId)
    })

    it('clears the active participant loading state once that participant becomes idle', async () => {
        const actId = 'act-1'
        const threadId = 'thread-1'
        const participantKey = 'participant-1'
        const downstreamKey = 'participant-2'
        const chatKey = `act:${actId}:thread:${threadId}:participant:${participantKey}`
        const downstreamChatKey = `act:${actId}:thread:${threadId}:participant:${downstreamKey}`
        const sessionId = 'session-1'
        const downstreamSessionId = 'session-2'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            actThreads: {
                [actId]: [{
                    id: threadId,
                    actId,
                    status: 'active',
                    participantSessions: {
                        [participantKey]: sessionId,
                        [downstreamKey]: downstreamSessionId,
                    },
                    createdAt: Date.now(),
                }],
            },
            seMessages: {
                [downstreamSessionId]: [{ id: 'msg-1', role: 'assistant', content: 'working', timestamp: Date.now() }],
            } as StudioState['seMessages'],
            initRealtimeEvents: vi.fn(),
            loadThreads: vi.fn(async () => {
                state.chatKeyToSession[downstreamChatKey] = downstreamSessionId
                state.sessionToChatKey[downstreamSessionId] = downstreamChatKey
            }),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createActTarget(chatKey, actId, threadId))
        sendMock.mockResolvedValue(undefined)
        statusMock.mockImplementation(async (sid: string) => ({
            status: sid === sessionId
                ? { type: 'idle' as const }
                : { type: 'busy' as const },
        }))
        messagesMock.mockResolvedValue({ messages: [], nextCursor: null })
        syncChatMessagesMock.mockResolvedValue({ messages: [], nextCursor: null })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createActTarget(chatKey, actId, threadId).runtimeConfig,
        }))

        await actions.sendActMessage(actId, threadId, participantKey, 'hello')
        await vi.advanceTimersByTimeAsync(2200)

        expect(state.sessionLoading[sessionId]).toBeUndefined()
        expect(state.seStatuses[sessionId]).toEqual({ type: 'idle' })
        expect(state.sessionLoading[downstreamSessionId]).toBeUndefined()
        expect(state.seStatuses[downstreamSessionId]).toEqual({ type: 'busy' })
    })
})
