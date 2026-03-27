import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import { createChatApprovals } from './chat-approvals'

const {
    respondPermissionMock,
    respondQuestionMock,
    rejectQuestionMock,
    showToastMock,
} = vi.hoisted(() => ({
    respondPermissionMock: vi.fn(),
    respondQuestionMock: vi.fn(),
    rejectQuestionMock: vi.fn(),
    showToastMock: vi.fn(),
}))

vi.mock('../../api', () => ({
    api: {
        chat: {
            respondPermission: respondPermissionMock,
            respondQuestion: respondQuestionMock,
            rejectQuestion: rejectQuestionMock,
        },
    },
}))

vi.mock('../../lib/toast', () => ({
    showToast: showToastMock,
}))

vi.mock('../../lib/api-errors', () => ({
    formatStudioApiErrorMessage: () => 'request failed',
}))

function createMinimalState(overrides: Partial<StudioState> = {}): StudioState {
    return {
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        historyCursors: {},
        chats: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        sessionMap: {},
        loadingPerformerId: null,
        sessions: [],
        pendingPermissions: {},
        pendingQuestions: {},
        todos: {},
        ...overrides,
    } as StudioState
}

describe('chat approvals', () => {
    beforeEach(() => {
        respondPermissionMock.mockReset()
        respondQuestionMock.mockReset()
        rejectQuestionMock.mockReset()
        showToastMock.mockReset()
    })

    it('removes permissions from both legacy and entity stores on success', async () => {
        const sessionId = 'session-1'
        const permission = { id: 'perm-1', sessionID: sessionId, permission: 'file.read', patterns: [], always: [] }
        const state = createMinimalState({
            pendingPermissions: { [sessionId]: permission },
            sePermissions: { [sessionId]: permission },
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        respondPermissionMock.mockResolvedValue(undefined)

        await createChatApprovals(set, get).respondToPermission(sessionId, permission.id, 'once')

        expect(state.pendingPermissions[sessionId]).toBeUndefined()
        expect(state.sePermissions[sessionId]).toBeUndefined()
    })

    it('restores questions into both legacy and entity stores on failure', async () => {
        const sessionId = 'session-1'
        const question = { id: 'q-1', sessionID: sessionId, questions: [] }
        const state = createMinimalState({
            pendingQuestions: { [sessionId]: question },
            seQuestions: { [sessionId]: question },
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        respondQuestionMock.mockRejectedValue(new Error('boom'))

        await createChatApprovals(set, get).respondToQuestion(sessionId, question.id, [])

        expect(state.pendingQuestions[sessionId]).toEqual(question)
        expect(state.seQuestions[sessionId]).toEqual(question)
        expect(showToastMock).toHaveBeenCalled()
    })
})
