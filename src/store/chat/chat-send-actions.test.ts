import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import { createChatSendActions } from './chat-send-actions'
import { createEmptyProjectionDirtyState } from '../runtime-change-policy'

const {
    sendMock,
    statusMock,
    syncPerformerMessagesMock,
    resolveChatRuntimeTargetMock,
} = vi.hoisted(() => ({
    sendMock: vi.fn(),
    statusMock: vi.fn(),
    syncPerformerMessagesMock: vi.fn(),
    resolveChatRuntimeTargetMock: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        chat: {
            send: sendMock,
            status: statusMock,
        },
    },
}))

vi.mock('../../lib/api-errors', () => ({
    formatStudioApiErrorMessage: () => 'request failed',
}))

vi.mock('../../lib/performers', () => ({
    hasModelConfig: () => true,
    resolvePerformerRuntimeConfig: vi.fn(),
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
    state.setSessionLoading = vi.fn()
    state.setSessionStatus = vi.fn()
    state.saveWorkspace = vi.fn(async () => {})

    return state
}

describe('chat send actions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sendMock.mockReset()
        statusMock.mockReset()
        syncPerformerMessagesMock.mockReset()
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
})
