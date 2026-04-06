import type { QuestionAnswer, PermissionRequest } from '@opencode-ai/sdk/v2'
import type { ChatSendRequest, ChatSessionCreateResponse } from '../../shared/chat-contracts'
import { createApiEventSource, deleteJSON, fetchApiResponse, fetchJSON, postJSON, putJSON } from '../api-core'
import type { SessionMessageLike } from '../lib/chat-messages'

export type ChatSessionMessagesResponse = {
    messages: SessionMessageLike[]
    nextCursor: string | null
}

export const chatApi = {
    createSession: (performerId: string, performerName: string, configHash: string, actId?: string) =>
        postJSON<ChatSessionCreateResponse>('/api/chat/sessions', { performerId, performerName, configHash, actId }),

    deleteSession: (id: string) =>
        deleteJSON<{ ok: boolean }>(`/api/chat/sessions/${id}`),

    updateSession: (id: string, title: string) =>
        putJSON<{ ok: boolean; title: string }>(`/api/chat/sessions/${id}`, { title }),

    send: (
        id: string,
        payload: ChatSendRequest,
    ) =>
        postJSON<{ accepted: boolean }>(`/api/chat/sessions/${id}/send`, payload satisfies ChatSendRequest),

    status: (id: string) =>
        fetchJSON<{ status: { type: 'idle' | 'busy' | 'retry' | 'error' } | null }>(`/api/chat/sessions/${id}/status`),

    abort: (id: string) =>
        postJSON<{ ok: boolean }>(`/api/chat/sessions/${id}/abort`),

    messages: async (id: string, options?: { limit?: number; before?: string }): Promise<ChatSessionMessagesResponse> => {
        const params = new URLSearchParams()
        if (typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
            params.set('limit', String(options.limit))
        }
        if (typeof options?.before === 'string' && options.before.trim()) {
            params.set('before', options.before.trim())
        }
        const query = params.toString()
        const res = await fetchApiResponse(`/api/chat/sessions/${id}/messages${query ? `?${query}` : ''}`)
        const payload = await res.json() as SessionMessageLike[] | { messages?: SessionMessageLike[] }
        return {
            messages: Array.isArray(payload) ? payload : (payload.messages || []),
            nextCursor: res.headers.get('x-next-cursor')?.trim() || null,
        }
    },

    diff: (id: string) =>
        fetchJSON<Array<Record<string, unknown>>>(`/api/chat/sessions/${id}/diff`),

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
        postJSON<Record<string, unknown>>(`/api/chat/sessions/${id}/revert`, { messageId, partId }),

    unrevert: (id: string) =>
        postJSON<Record<string, unknown>>(`/api/chat/sessions/${id}/unrevert`),

    list: () =>
        fetchJSON<Array<{
            id: string
            title?: string
            createdAt?: number
            updatedAt?: number
            parentId?: string | null
            status?: 'idle' | 'busy' | 'retry' | 'error'
        }>>('/api/chat/sessions'),

    events: () => createApiEventSource('/api/chat/events'),

    resolveSession: (id: string) =>
        fetchJSON<{ found: boolean; sessionId: string; ownerId: string; ownerKind: string }>(`/api/chat/sessions/${id}/resolve`),

    respondPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') =>
        postJSON<{ ok: boolean }>(`/api/chat/sessions/${sessionId}/permission/${permissionId}/respond`, { response }),

    listPendingPermissions: () =>
        fetchJSON<PermissionRequest[]>('/api/chat/permissions'),

    respondQuestion: (questionId: string, answers: QuestionAnswer[]) =>
        postJSON<{ ok: boolean }>(`/api/chat/questions/${questionId}/respond`, { answers }),

    rejectQuestion: (questionId: string) =>
        postJSON<{ ok: boolean }>(`/api/chat/questions/${questionId}/reject`),
}
