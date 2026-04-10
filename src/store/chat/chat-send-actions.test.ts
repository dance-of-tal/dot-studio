import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import type { ChatRuntimeConfig } from './chat-runtime-target'
import { createChatSendActions } from './chat-send-actions'
import { createEmptyProjectionDirtyState } from '../runtime-change-policy'

const {
    sendMock,
    listModelsMock,
    resolveChatRuntimeTargetMock,
} = vi.hoisted(() => ({
    sendMock: vi.fn(),
    listModelsMock: vi.fn(),
    resolveChatRuntimeTargetMock: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        chat: {
            send: sendMock,
        },
        models: {
            list: listModelsMock,
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
    syncChatMessages: vi.fn(),
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

function createAssistantTarget(
    chatKey: string,
    availableModels: Array<{ provider: string; providerName: string; modelId: string; name: string }> = [],
    model: { provider: string; modelId: string } | null = { provider: 'openai', modelId: 'gpt-5.4' },
) {
    return {
        chatKey,
        kind: 'assistant' as const,
        name: 'Studio Assistant',
        runtimeConfig: {
            ...createRuntimeConfig(),
            model,
        },
        assistantContext: {
            workingDir: '/tmp/workspace',
            performers: [],
            acts: [],
            drafts: [],
            availableModels,
        },
        executionScope: {
            performerId: null,
            actId: null,
            clearPerformerIds: [],
            clearActIds: [],
        },
        requestTarget: {
            performerId: chatKey,
            performerName: 'Studio Assistant',
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
        assistantAvailableModels: [],
        watchSessionLifecycle: vi.fn(),
        stopWatchingSessionLifecycle: vi.fn(),
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
    state.setAssistantModel = vi.fn((model) => {
        state.assistantModel = model
    })
    state.setAssistantAvailableModels = vi.fn((models) => {
        state.assistantAvailableModels = models
    })

    return state
}

describe('chat send actions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sendMock.mockReset()
        listModelsMock.mockReset()
        resolveChatRuntimeTargetMock.mockReset()
    })

    it('starts authoritative lifecycle supervision after a successful send', async () => {
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

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createPerformerTarget().runtimeConfig,
        }))

        await actions.sendMessage('performer-1', 'hello')

        expect(state.watchSessionLifecycle).toHaveBeenCalledWith('performer-1', sessionId)
    })

    it('does not start client lifecycle supervision for act sends', async () => {
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
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createActTarget(chatKey, actId, threadId))
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createActTarget(chatKey, actId, threadId).runtimeConfig,
        }))

        await actions.sendActMessage(actId, threadId, participantKey, 'hello')

        expect(state.watchSessionLifecycle).not.toHaveBeenCalled()
    })

    it('hydrates assistant available models before sending when the workspace cache is empty', async () => {
        const chatKey = 'studio-assistant'
        const sessionId = 'session-assistant-1'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockImplementation((getState: typeof get, nextChatKey: string) => (
            createAssistantTarget(nextChatKey, getState().assistantAvailableModels, getState().assistantModel)
        ))
        listModelsMock.mockResolvedValue([
            {
                provider: 'openai',
                providerName: 'OpenAI',
                id: 'gpt-5.4',
                name: 'GPT-5.4',
                connected: true,
            },
            {
                provider: 'anthropic',
                providerName: 'Anthropic',
                id: 'claude-disconnected',
                name: 'Claude Disconnected',
                connected: false,
            },
        ])
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createAssistantTarget(chatKey).runtimeConfig,
        }))

        await actions.sendMessage(chatKey, 'hello')

        expect(listModelsMock).toHaveBeenCalledTimes(1)
        expect(state.setAssistantAvailableModels).toHaveBeenCalledWith([
            {
                provider: 'openai',
                providerName: 'OpenAI',
                modelId: 'gpt-5.4',
                name: 'GPT-5.4',
            },
        ])
        expect(sendMock).toHaveBeenCalledWith(sessionId, expect.objectContaining({
            assistantContext: expect.objectContaining({
                availableModels: [
                    {
                        provider: 'openai',
                        providerName: 'OpenAI',
                        modelId: 'gpt-5.4',
                        name: 'GPT-5.4',
                    },
                ],
            }),
        }))
    })

    it('replaces a stale assistant model with the first connected model before sending', async () => {
        const chatKey = 'studio-assistant'
        const sessionId = 'session-assistant-2'
        const state = createMinimalState({
            assistantModel: { provider: 'openai', modelId: 'gpt-stale' },
            assistantAvailableModels: [
                {
                    provider: 'openai',
                    providerName: 'OpenAI',
                    modelId: 'gpt-stale',
                    name: 'GPT Stale',
                },
            ],
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockImplementation((getState: typeof get, nextChatKey: string) => (
            createAssistantTarget(nextChatKey, getState().assistantAvailableModels, getState().assistantModel)
        ))
        listModelsMock.mockResolvedValue([
            {
                provider: 'openai',
                providerName: 'OpenAI',
                id: 'gpt-5.4',
                name: 'GPT-5.4',
                connected: true,
            },
        ])
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createAssistantTarget(chatKey).runtimeConfig,
        }))

        await actions.sendMessage(chatKey, 'hello')

        expect(state.setAssistantModel).toHaveBeenCalledWith({
            provider: 'openai',
            modelId: 'gpt-5.4',
        })
        expect(sendMock).toHaveBeenCalledWith(sessionId, expect.objectContaining({
            performer: expect.objectContaining({
                model: {
                    provider: 'openai',
                    modelId: 'gpt-5.4',
                },
            }),
            assistantContext: expect.objectContaining({
                availableModels: [
                    {
                        provider: 'openai',
                        providerName: 'OpenAI',
                        modelId: 'gpt-5.4',
                        name: 'GPT-5.4',
                    },
                ],
            }),
        }))
    })
})
