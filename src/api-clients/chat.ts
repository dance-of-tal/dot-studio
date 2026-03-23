import type { QuestionAnswer } from '@opencode-ai/sdk/v2'
import type { ChatSendRequest, ChatSessionCreateResponse } from '../../shared/chat-contracts'
import type { ExecutionMode } from '../../shared/safe-mode'
import { createApiEventSource, deleteJSON, fetchJSON, postJSON, putJSON } from '../api-core'
import type { SessionMessageLike } from '../lib/chat-messages'

export const chatApi = {
    createSession: (performerId: string, performerName: string, configHash: string, executionMode: ExecutionMode, actId?: string) =>
        postJSON<ChatSessionCreateResponse>('/api/chat/sessions', { performerId, performerName, configHash, executionMode, actId }),

    deleteSession: (id: string) =>
        deleteJSON<{ ok: boolean }>(`/api/chat/sessions/${id}`),

    updateSession: (id: string, title: string) =>
        putJSON<{ ok: boolean; title: string }>(`/api/chat/sessions/${id}`, { title }),

    send: (
        id: string,
        payload: ChatSendRequest,
    ) =>
        postJSON<{ accepted: boolean }>(`/api/chat/sessions/${id}/send`, payload satisfies ChatSendRequest),

    abort: (id: string) =>
        postJSON<{ ok: boolean }>(`/api/chat/sessions/${id}/abort`),

    messages: (id: string) =>
        fetchJSON<SessionMessageLike[] | { messages: SessionMessageLike[] }>(`/api/chat/sessions/${id}/messages`),

    diff: (id: string) =>
        fetchJSON<Array<Record<string, unknown>>>(`/api/chat/sessions/${id}/diff`),

    share: (id: string) =>
        postJSON<{ url: string }>(`/api/chat/sessions/${id}/share`),

    summarize: (
        id: string,
        payload?: {
            providerID?: string
            modelID?: string
            auto?: boolean
        },
    ) =>
        postJSON<boolean>(`/api/chat/sessions/${id}/summarize`, payload || {}),

    revert: (id: string, messageId: string, partId?: string) =>
        postJSON<{ ok: boolean }>(`/api/chat/sessions/${id}/revert`, { messageId, partId }),

    list: () =>
        fetchJSON<Array<{ id: string; title?: string; createdAt?: number }>>('/api/chat/sessions'),

    events: () => createApiEventSource('/api/chat/events'),

    respondPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') =>
        postJSON<{ ok: boolean }>(`/api/chat/sessions/${sessionId}/permission/${permissionId}/respond`, { response }),

    respondQuestion: (questionId: string, answers: QuestionAnswer[]) =>
        postJSON<{ ok: boolean }>(`/api/chat/questions/${questionId}/respond`, { answers }),

    rejectQuestion: (questionId: string) =>
        postJSON<{ ok: boolean }>(`/api/chat/questions/${questionId}/reject`),
}
