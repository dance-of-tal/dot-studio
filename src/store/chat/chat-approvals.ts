/**
 * Permission and question approval handlers extracted from chatSlice.
 */
import { api } from '../../api'
import { showToast } from '../../lib/toast'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import type { ChatGet, ChatSet } from './chat-internals'

export function createChatApprovals(set: ChatSet, _get: ChatGet) {
    return {
        respondToPermission: async (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => {
            // Optimistically remove from UI to prevent double click
            set((state) => {
                const next = { ...state.pendingPermissions }
                delete next[sessionId]
                return { pendingPermissions: next }
            })
            try {
                await api.chat.respondPermission(sessionId, permissionId, response)
            } catch (err) {
                console.error('Failed to respond to permission:', err)
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },

        respondToQuestion: async (sessionId: string, questionId: string, answers: Record<string, string[]>) => {
            set((state) => {
                const next = { ...state.pendingQuestions }
                delete next[sessionId]
                return { pendingQuestions: next }
            })
            try {
                await api.chat.respondQuestion(questionId, answers)
            } catch (err) {
                console.error('Failed to respond to question:', err)
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },

        rejectQuestion: async (sessionId: string, questionId: string) => {
            set((state) => {
                const next = { ...state.pendingQuestions }
                delete next[sessionId]
                return { pendingQuestions: next }
            })
            try {
                await api.chat.rejectQuestion(questionId)
            } catch (err) {
                console.error('Failed to reject question:', err)
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },
    }
}
