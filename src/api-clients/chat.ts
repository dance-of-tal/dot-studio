import type { AssetRef, DanceDeliveryMode, ModelConfig } from '../types'
import type { ChatSendRequest, ChatSessionCreateResponse } from '../../shared/chat-contracts'
import type { ExecutionMode } from '../../shared/safe-mode'
import { createApiEventSource, deleteJSON, fetchJSON, postJSON, putJSON } from '../api-core'

export const chatApi = {
    createSession: (performerId: string, performerName: string, configHash: string, executionMode: ExecutionMode, actId?: string) =>
        postJSON<ChatSessionCreateResponse>('/api/chat/sessions', { performerId, performerName, configHash, executionMode, actId }),

    deleteSession: (id: string) =>
        deleteJSON<{ ok: boolean }>(`/api/chat/sessions/${id}`),

    updateSession: (id: string, title: string) =>
        putJSON<any>(`/api/chat/sessions/${id}`, { title }),

    send: (
        id: string,
        payload: {
            message: string
            performer: {
                performerId: string
                performerName: string
                talRef: AssetRef | null
                danceRefs: AssetRef[]
                extraDanceRefs?: AssetRef[]
                model?: ModelConfig | null
                modelVariant?: string | null
                agentId?: string | null
                mcpServerNames?: string[]
                danceDeliveryMode?: DanceDeliveryMode
                planMode?: boolean
            }
            attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>
            mentions?: Array<{ performerId: string }>
            actId?: string
            actThreadId?: string
        },
    ) =>
        postJSON<{ accepted: boolean }>(`/api/chat/sessions/${id}/send`, payload satisfies ChatSendRequest),

    abort: (id: string) =>
        postJSON<{ ok: boolean }>(`/api/chat/sessions/${id}/abort`),

    messages: (id: string) =>
        fetchJSON<any[]>(`/api/chat/sessions/${id}/messages`),

    diff: (id: string) =>
        fetchJSON<any[]>(`/api/chat/sessions/${id}/diff`),

    todo: (id: string) =>
        fetchJSON<Array<{ id: string; content: string; status: string; priority: string }>>(`/api/chat/sessions/${id}/todo`),

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
        postJSON<any>(`/api/chat/sessions/${id}/revert`, { messageId, partId }),

    list: () =>
        fetchJSON<any[]>('/api/chat/sessions'),

    events: () => createApiEventSource('/api/chat/events'),

    respondPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') =>
        postJSON<{ ok: boolean }>(`/api/chat/sessions/${sessionId}/permission/${permissionId}/respond`, { response }),

    respondQuestion: (questionId: string, answers: Record<string, string[]>) =>
        postJSON<{ ok: boolean }>(`/api/chat/questions/${questionId}/respond`, { answers }),

    rejectQuestion: (questionId: string) =>
        postJSON<{ ok: boolean }>(`/api/chat/questions/${questionId}/reject`),
}
