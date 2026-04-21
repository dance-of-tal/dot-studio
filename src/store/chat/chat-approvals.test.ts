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
    const state = {
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
        sessionMutationPending: {},
        activeChatPerformerId: null,
        sessions: [],
        ...overrides,
    } as StudioState

    state.clearSessionPermission = (sessionId: string) => {
        delete state.sePermissions[sessionId]
    }
    state.setSessionPermission = (sessionId: string, permission) => {
        state.sePermissions[sessionId] = permission
    }
    state.clearSessionQuestion = (sessionId: string) => {
        delete state.seQuestions[sessionId]
    }
    state.setSessionQuestion = (sessionId: string, question) => {
        state.seQuestions[sessionId] = question
    }

    return state
}

describe('chat approvals', () => {
    beforeEach(() => {
        respondPermissionMock.mockReset()
        respondQuestionMock.mockReset()
        rejectQuestionMock.mockReset()
        showToastMock.mockReset()
    })

    it('removes permissions from session-owned entity state on success', async () => {
        const sessionId = 'session-1'
        const permission = { id: 'perm-1', sessionID: sessionId, permission: 'file.read', patterns: [], always: [], metadata: {} }
        const state = createMinimalState({
            sePermissions: { [sessionId]: permission },
        })
        const set = vi.fn()
        const get = () => state

        respondPermissionMock.mockResolvedValue(undefined)

        await createChatApprovals(set, get).respondToPermission(sessionId, permission.id, 'once')

        expect(state.sePermissions[sessionId]).toBeUndefined()
    })

    it('restores questions into session-owned entity state on failure', async () => {
        const sessionId = 'session-1'
        const question = { id: 'q-1', sessionID: sessionId, questions: [] }
        const state = createMinimalState({
            seQuestions: { [sessionId]: question },
        })
        const set = vi.fn()
        const get = () => state

        respondQuestionMock.mockRejectedValue(new Error('boom'))

        await createChatApprovals(set, get).respondToQuestion(sessionId, question.id, [])

        expect(state.seQuestions[sessionId]).toEqual(question)
        expect(showToastMock).toHaveBeenCalled()
    })
})
