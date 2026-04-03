import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import { createChatSendActions } from './chat-send-actions'
import { createEmptyProjectionDirtyState } from '../runtime-change-policy'

const {
    sendMock,
    statusMock,
    messagesMock,
    syncPerformerMessagesMock,
    resolveChatRuntimeTargetMock,
    resolvePerformerRuntimeConfigMock,
} = vi.hoisted(() => ({
    sendMock: vi.fn(),
    statusMock: vi.fn(),
    messagesMock: vi.fn(),
    syncPerformerMessagesMock: vi.fn(),
    resolveChatRuntimeTargetMock: vi.fn(),
    resolvePerformerRuntimeConfigMock: vi.fn(),
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
    resolvePerformerRuntimeConfig: resolvePerformerRuntimeConfigMock,
}))

vi.mock('./chat-internals', () => ({
    addChatMessage: vi.fn(),
    appendPerformerSystemMessage: vi.fn(),
    getPerformerById: vi.fn(() => ({ id: 'performer-1', name: 'Performer 1' })),
    syncPerformerMessages: syncPerformerMessagesMock,
}))

vi.mock('./chat-runtime-target', () => ({
    resolveChatRuntimeTarget: resolveChatRuntimeTargetMock,
}))

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
        syncPerformerMessagesMock.mockReset()
        resolveChatRuntimeTargetMock.mockReset()
        resolvePerformerRuntimeConfigMock.mockReset()
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

        resolveChatRuntimeTargetMock.mockReturnValue({
            name: 'Performer 1',
            runtimeConfig: {
                talRef: null,
                danceRefs: [],
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                modelVariant: null,
                agentId: 'build',
                mcpServerNames: [],
                danceDeliveryMode: 'auto',
                planMode: false,
            },
        })
        sendMock.mockResolvedValue(undefined)
        statusMock.mockResolvedValue({ status: { type: 'busy' } })
        syncPerformerMessagesMock.mockImplementation(async () => {
            state.sessionLoading[sessionId] = false
            return []
        })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: resolveChatRuntimeTargetMock().runtimeConfig,
        }))

        await actions.sendMessage('performer-1', 'hello')
        await vi.advanceTimersByTimeAsync(2200)

        expect(statusMock).toHaveBeenCalledWith(sessionId)
        expect(syncPerformerMessagesMock).toHaveBeenCalledWith(set, get, 'performer-1', sessionId)
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

        resolveChatRuntimeTargetMock.mockReturnValue({
            name: 'Performer 1',
            runtimeConfig: {
                talRef: null,
                danceRefs: [],
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                modelVariant: null,
                agentId: 'build',
                mcpServerNames: [],
                danceDeliveryMode: 'auto',
                planMode: false,
            },
        })
        sendMock.mockResolvedValue(undefined)
        statusMock.mockResolvedValue({ status: { type: 'busy' } })
        syncPerformerMessagesMock.mockResolvedValue({
            messages: [
                { id: 'user-1', role: 'user', content: 'hello', timestamp: 1000 },
                { id: 'msg-1', role: 'assistant', content: 'done', timestamp: 1001 },
            ],
            nextCursor: null,
        })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: resolveChatRuntimeTargetMock().runtimeConfig,
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
            performers: [{
                id: 'local-performer',
                name: 'Lead',
                meta: { derivedFrom: 'draft:performer-1' },
            }] as unknown as StudioState['performers'],
            acts: [{
                id: actId,
                name: 'Act',
                participants: {
                    [participantKey]: {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'Lead',
                    },
                },
                relations: [],
            }] as unknown as StudioState['acts'],
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

        resolvePerformerRuntimeConfigMock.mockReturnValue({
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            agentId: 'build',
            mcpServerNames: [],
            danceDeliveryMode: 'auto',
            planMode: false,
        })
        sendMock.mockResolvedValue(undefined)
        statusMock.mockResolvedValue({ status: { type: 'busy' } })
        messagesMock.mockResolvedValue({ messages: [], nextCursor: null })
        syncPerformerMessagesMock.mockImplementation(async () => {
            delete state.sessionLoading[sessionId]
            return []
        })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: resolvePerformerRuntimeConfigMock.mock.results[0]?.value,
        }))

        await actions.sendActMessage(actId, threadId, participantKey, 'hello')
        await vi.advanceTimersByTimeAsync(2200)

        expect(state.loadThreads).toHaveBeenCalledWith(actId)
        expect(syncPerformerMessagesMock).toHaveBeenCalledWith(set, get, chatKey, sessionId)
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
            performers: [{
                id: 'local-performer',
                name: 'Lead',
                meta: { derivedFrom: 'draft:performer-1' },
            }] as unknown as StudioState['performers'],
            acts: [{
                id: actId,
                name: 'Act',
                participants: {
                    [participantKey]: {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'Lead',
                    },
                    [downstreamKey]: {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'Support',
                    },
                },
                relations: [],
            }] as unknown as StudioState['acts'],
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

        resolvePerformerRuntimeConfigMock.mockReturnValue({
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            agentId: 'build',
            mcpServerNames: [],
            danceDeliveryMode: 'auto',
            planMode: false,
        })
        sendMock.mockResolvedValue(undefined)
        statusMock.mockImplementation(async (sid: string) => ({
            status: sid === downstreamSessionId
                ? { type: 'busy' as const }
                : { type: 'busy' as const },
        }))
        messagesMock.mockResolvedValue({ messages: [], nextCursor: null })
        syncPerformerMessagesMock.mockResolvedValue({ messages: [], nextCursor: null })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: resolvePerformerRuntimeConfigMock.mock.results[0]?.value,
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
            performers: [{
                id: 'local-performer',
                name: 'Lead',
                meta: { derivedFrom: 'draft:performer-1' },
            }] as unknown as StudioState['performers'],
            acts: [{
                id: actId,
                name: 'Act',
                participants: {
                    [participantKey]: {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'Lead',
                    },
                    [downstreamKey]: {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'Support',
                    },
                },
                relations: [],
            }] as unknown as StudioState['acts'],
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

        resolvePerformerRuntimeConfigMock.mockReturnValue({
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            agentId: 'build',
            mcpServerNames: [],
            danceDeliveryMode: 'auto',
            planMode: false,
        })
        sendMock.mockResolvedValue(undefined)
        statusMock.mockImplementation(async (sid: string) => ({
            status: sid === sessionId
                ? { type: 'idle' as const }
                : { type: 'busy' as const },
        }))
        messagesMock.mockResolvedValue({ messages: [], nextCursor: null })
        syncPerformerMessagesMock.mockResolvedValue({ messages: [], nextCursor: null })

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: resolvePerformerRuntimeConfigMock.mock.results[0]?.value,
        }))

        await actions.sendActMessage(actId, threadId, participantKey, 'hello')
        await vi.advanceTimersByTimeAsync(2200)

        expect(state.sessionLoading[sessionId]).toBeUndefined()
        expect(state.seStatuses[sessionId]).toEqual({ type: 'idle' })
        expect(state.sessionLoading[downstreamSessionId]).toBeUndefined()
        expect(state.seStatuses[downstreamSessionId]).toEqual({ type: 'busy' })
    })
})
