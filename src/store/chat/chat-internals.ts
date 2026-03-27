/**
 * Chat slice internal utilities and types shared across sub-modules.
 */
import type { StudioState } from '../types'
import { api } from '../../api'
import {
    mapSessionMessagesToChatMessages,
    mergeSystemPrefixMessages,
    type SessionMessageLike,
} from '../../lib/chat-messages'
import type { ChatMessage, PerformerNode } from '../../types'

export type ChatGet = () => StudioState
export type ChatSet = (fn: ((state: StudioState) => Partial<StudioState>) | Partial<StudioState>) => void

export function getPerformerById(get: ChatGet, performerId: string): PerformerNode | null {
    return get().performers.find((item) => item.id === performerId) || null
}

export function getPerformerSessionId(get: ChatGet, performerId: string): string | undefined {
    return get().sessionMap[performerId]
}

export function addChatMessage(set: ChatSet, _get: ChatGet, performerId: string, msg: ChatMessage) {
    set((state) => ({
        chats: {
            ...state.chats,
            [performerId]: [...(state.chats[performerId] || []), msg],
        },
    }))
}

export function appendPerformerSystemMessage(set: ChatSet, _get: ChatGet, performerId: string, content: string) {
    addChatMessage(set, _get, performerId, {
        id: `msg-${Date.now()}`,
        role: 'system' as const,
        content,
        timestamp: Date.now(),
    })
}

export async function syncPerformerMessages(
    set: ChatSet,
    get: ChatGet,
    performerId: string,
    sessionId: string,
) {
    const response = await api.chat.messages(sessionId)
    const messages: SessionMessageLike[] = Array.isArray(response) ? response : (response.messages || [])
    const mapped = mapSessionMessagesToChatMessages(messages)
    const merged = mergeSystemPrefixMessages(get().chatPrefixes[performerId], mapped)
    // Only carry forward system-role prefix messages (e.g. mode-switch notices)
    // that aren't already present in the server-synced messages.
    // User/assistant messages from previously detached sessions must NOT be
    // prepended — the server response already contains the full session history.
    set((state) => {
        return {
            chats: {
                ...state.chats,
                [performerId]: merged,
            },
        }
    })
    get().registerBinding(performerId, sessionId)
    if (!get().seEntities[sessionId]) {
        get().upsertSession({ id: sessionId, status: get().seStatuses[sessionId] || { type: 'idle' } })
    }
    get().setSessionMessages(sessionId, mapped)
    if (getPerformerById(get, performerId)?.executionMode === 'safe') {
        void get().refreshSafeOwner('performer', performerId)
    }
    return messages
}
