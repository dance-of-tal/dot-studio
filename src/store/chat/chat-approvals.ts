/**
 * Permission and question approval handlers extracted from chatSlice.
 */
import type { QuestionAnswer } from '@opencode-ai/sdk/v2'
import { api } from '../../api'
import { showToast } from '../../lib/toast'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import type { ChatGet, ChatSet } from './chat-internals'

export function createChatApprovals(set: ChatSet, get: ChatGet) {
    return {
        respondToPermission: async (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => {
            // Capture for rollback on failure
            const original = get().sePermissions[sessionId]
            // Optimistically remove from UI to prevent double click
            get().clearSessionPermission(sessionId)
            try {
                await api.chat.respondPermission(sessionId, permissionId, response)
            } catch (err) {
                console.error('Failed to respond to permission:', err)
                // Restore on failure so user can retry
                if (original) {
                    get().setSessionPermission(sessionId, original)
                }
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },

        respondToQuestion: async (sessionId: string, questionId: string, answers: QuestionAnswer[]) => {
            const original = get().seQuestions[sessionId]
            get().clearSessionQuestion(sessionId)
            try {
                await api.chat.respondQuestion(questionId, answers)
            } catch (err) {
                console.error('Failed to respond to question:', err)
                if (original) {
                    get().setSessionQuestion(sessionId, original)
                }
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },

        rejectQuestion: async (sessionId: string, questionId: string) => {
            const original = get().seQuestions[sessionId]
            get().clearSessionQuestion(sessionId)
            try {
                await api.chat.rejectQuestion(questionId)
            } catch (err) {
                console.error('Failed to reject question:', err)
                if (original) {
                    get().setSessionQuestion(sessionId, original)
                }
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },
    }
}
