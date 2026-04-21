/**
 * Permission and question approval handlers extracted from chatSlice.
 */
import type { QuestionAnswer } from '@opencode-ai/sdk/v2'
import { api } from '../../api'
import { showToast } from '../../lib/toast'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import type { ChatGet } from './chat-internals'
import { patchSessionRuntimeActor } from '../session/session-runtime-manager'
import type { StudioState } from '../types'

type ChatSet = (fn: ((state: StudioState) => Partial<StudioState>) | Partial<StudioState>) => void

export function createChatApprovals(set: ChatSet, get: ChatGet) {
    return {
        respondToPermission: async (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => {
            // Capture for rollback on failure
            const original = get().sePermissions[sessionId]
            // Optimistically remove from UI to prevent double click
            get().clearSessionPermission(sessionId)
            patchSessionRuntimeActor(set, get, {
                sessionId,
                patch: { hasPermission: false },
            })
            try {
                await api.chat.respondPermission(sessionId, permissionId, response)
            } catch (err) {
                console.error('Failed to respond to permission:', err)
                // Restore on failure so user can retry
                if (original) {
                    get().setSessionPermission(sessionId, original)
                    patchSessionRuntimeActor(set, get, {
                        sessionId,
                        patch: { hasPermission: true },
                    })
                }
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },

        respondToQuestion: async (sessionId: string, questionId: string, answers: QuestionAnswer[]) => {
            const original = get().seQuestions[sessionId]
            get().clearSessionQuestion(sessionId)
            patchSessionRuntimeActor(set, get, {
                sessionId,
                patch: { hasQuestion: false },
            })
            try {
                await api.chat.respondQuestion(questionId, answers)
            } catch (err) {
                console.error('Failed to respond to question:', err)
                if (original) {
                    get().setSessionQuestion(sessionId, original)
                    patchSessionRuntimeActor(set, get, {
                        sessionId,
                        patch: { hasQuestion: true },
                    })
                }
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },

        rejectQuestion: async (sessionId: string, questionId: string) => {
            const original = get().seQuestions[sessionId]
            get().clearSessionQuestion(sessionId)
            patchSessionRuntimeActor(set, get, {
                sessionId,
                patch: { hasQuestion: false },
            })
            try {
                await api.chat.rejectQuestion(questionId)
            } catch (err) {
                console.error('Failed to reject question:', err)
                if (original) {
                    get().setSessionQuestion(sessionId, original)
                    patchSessionRuntimeActor(set, get, {
                        sessionId,
                        patch: { hasQuestion: true },
                    })
                }
                showToast(formatStudioApiErrorMessage(err), 'error')
            }
        },
    }
}
