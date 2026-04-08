import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../types'
import type { StudioState } from '../types'
import { createChatSessionManagement } from './chat-session-management'

const {
    revertMock,
    unrevertMock,
    diffMock,
    syncChatMessagesMock,
    appendSystemNoticeMock,
} = vi.hoisted(() => ({
    revertMock: vi.fn(),
    unrevertMock: vi.fn(),
    diffMock: vi.fn(),
    syncChatMessagesMock: vi.fn(),
    appendSystemNoticeMock: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        chat: {
            revert: revertMock,
            unrevert: unrevertMock,
            diff: diffMock,
            list: vi.fn(),
            deleteSession: vi.fn(),
            abort: vi.fn(),
        },
    },
}))

vi.mock('../../lib/api-errors', () => ({
    formatStudioApiErrorMessage: () => 'request failed',
}))

vi.mock('../../lib/toast', () => ({
    showToast: vi.fn(),
}))

vi.mock('./chat-internals', () => ({
    getChatSessionId: (get: () => StudioState, chatKey: string) => get().chatKeyToSession[chatKey],
    syncChatMessages: syncChatMessagesMock,
}))

vi.mock('../session', () => ({
    appendSystemNotice: appendSystemNoticeMock,
    clearChatSessionView: vi.fn(),
    createFreshSessionBinding: vi.fn(),
    detachChatSession: vi.fn(),
    selectMessagesForChatKey: (state: StudioState, chatKey: string) => {
        const sessionId = state.chatKeyToSession[chatKey]
        return sessionId ? (state.seMessages[sessionId] || []) : []
    },
    syncSessionSnapshot: vi.fn(),
}))

function createMessage(id: string, role: ChatMessage['role'], content: string, timestamp: number): ChatMessage {
    return { id, role, content, timestamp }
}

function createMinimalState(): StudioState {
    const state = {
        selectedPerformerId: 'performer-1',
        selectedPerformerSessionId: 'session-1',
        chatKeyToSession: { 'performer-1': 'session-1' },
        sessionToChatKey: { 'session-1': 'performer-1' },
        seMessages: {
            'session-1': [
                createMessage('user-1', 'user', 'first', 1),
                createMessage('assistant-1', 'assistant', 'ack', 2),
                createMessage('user-2', 'user', 'second', 3),
                createMessage('assistant-2', 'assistant', 'done', 4),
                createMessage('user-3', 'user', 'third', 5),
            ],
        },
        seStatuses: {
            'session-1': { type: 'idle' },
        },
        sessionReverts: {},
        sessionLoading: {},
        chatDrafts: {},
        chatPrefixes: {},
        seEntities: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        sessions: [],
        activeChatPerformerId: 'performer-1',
    } as unknown as StudioState

    state.setSessionMutationPending = vi.fn()
    state.setSessionRevert = vi.fn((sessionId: string, revert: { messageId: string; partId?: string }) => {
        state.sessionReverts[sessionId] = revert
    })
    state.clearSessionRevert = vi.fn((sessionId: string) => {
        delete state.sessionReverts[sessionId]
    })
    state.setSessionLoading = vi.fn()
    state.setSessionStatus = vi.fn()
    state.setSessionMessages = vi.fn((sessionId: string, messages: ChatMessage[]) => {
        state.seMessages[sessionId] = messages
    })
    state.setChatPrefixMessages = vi.fn()
    state.listSessions = vi.fn(async () => {})
    state.removeSession = vi.fn()

    return state
}

describe('chat-session-management review/revert flow', () => {
    beforeEach(() => {
        revertMock.mockReset()
        unrevertMock.mockReset()
        diffMock.mockReset()
        syncChatMessagesMock.mockReset()
        appendSystemNoticeMock.mockReset()
    })

    it('walks review diff, revert, progressive restore, and final unrevert in one flow', async () => {
        const state = createMinimalState()
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        const initialDiff = [{ file: 'src/example.ts', additions: 3, deletions: 1 }]
        const revertedDiff = [{ file: 'src/example.ts', additions: 1, deletions: 1 }]
        const finalDiff: Array<Record<string, unknown>> = []

        diffMock
            .mockResolvedValueOnce(initialDiff)
            .mockResolvedValueOnce(revertedDiff)
            .mockResolvedValueOnce(finalDiff)

        revertMock
            .mockResolvedValueOnce({ revert: { messageID: 'user-2' } })
            .mockResolvedValueOnce({ revert: { messageID: 'user-3' } })
        unrevertMock.mockResolvedValueOnce({})
        syncChatMessagesMock.mockResolvedValue(undefined)

        const actions = createChatSessionManagement(set, get)

        await expect(actions.getDiff('performer-1')).resolves.toEqual(initialDiff)

        await actions.revertSession('performer-1', 'user-2')
        expect(revertMock).toHaveBeenNthCalledWith(1, 'session-1', 'user-2')
        expect(state.sessionReverts['session-1']).toEqual({ messageId: 'user-2' })

        await expect(actions.getDiff('performer-1')).resolves.toEqual(revertedDiff)

        await actions.restoreRevertedMessage('performer-1', 'user-2')
        expect(revertMock).toHaveBeenNthCalledWith(2, 'session-1', 'user-3')
        expect(state.sessionReverts['session-1']).toEqual({ messageId: 'user-3' })

        await expect(actions.getDiff('performer-1')).resolves.toEqual(finalDiff)

        await actions.restoreRevertedMessage('performer-1', 'user-3')
        expect(unrevertMock).toHaveBeenCalledWith('session-1')
        expect(state.sessionReverts['session-1']).toBeUndefined()
        expect(syncChatMessagesMock).toHaveBeenCalledTimes(3)
        expect(state.setSessionMutationPending).toHaveBeenNthCalledWith(1, 'session-1', true)
        expect(state.setSessionMutationPending).toHaveBeenLastCalledWith('session-1', false)
    })
})
