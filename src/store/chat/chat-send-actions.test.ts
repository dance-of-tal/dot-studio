import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import type { ChatRuntimeConfig } from './chat-runtime-target'
import { createChatSendActions } from './chat-send-actions'
import { createEmptyProjectionDirtyState } from '../runtime-change-policy'

const {
    sendMock,
    resolveChatRuntimeTargetMock,
} = vi.hoisted(() => ({
    sendMock: vi.fn(),
    resolveChatRuntimeTargetMock: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        chat: {
            send: sendMock,
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

    return state
}

describe('chat send actions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sendMock.mockReset()
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
})
