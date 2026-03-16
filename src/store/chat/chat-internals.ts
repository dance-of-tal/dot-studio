/**
 * Chat slice internal utilities and types shared across sub-modules.
 */
import type { StudioState } from '../types'
import { api } from '../../api'
import { mapSessionMessagesToChatMessages } from '../../lib/chat-messages'
import type { ChatMessage } from '../../types'

export type ChatGet = () => StudioState
export type ChatSet = (fn: ((state: StudioState) => Partial<StudioState>) | Partial<StudioState>) => void

export function getPerformerById(get: ChatGet, performerId: string) {
    return get().performers.find((item: any) => item.id === performerId) as any
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
    const res: any = await api.chat.messages(sessionId)
    const messages: any[] = res?.messages ?? res ?? []
    const mapped = mapSessionMessagesToChatMessages(messages)
    set((state) => ({
        chats: {
            ...state.chats,
            [performerId]: [
                ...(state.chatPrefixes[performerId] || []),
                ...mapped,
            ],
        },
    }))
    if (getPerformerById(get, performerId)?.executionMode === 'safe') {
        void get().refreshSafeOwner('performer', performerId)
    }
    return messages
}

export function scheduleSessionFallbackSync(
    set: ChatSet,
    get: ChatGet,
    performerId: string,
    sessionId: string,
    startedAt: number,
    attempt = 0,
) {
    const maxAttempts = 8
    const delay = attempt === 0 ? 2500 : 3000

    globalThis.setTimeout(async () => {
        if (get().loadingPerformerId !== performerId) {
            return
        }

        try {
            const messages = await syncPerformerMessages(set, get, performerId, sessionId)
            const mapped = mapSessionMessagesToChatMessages(messages)
            const latestAssistant = [...messages]
                .reverse()
                .find((message: any) => (message?.info?.role || message?.role) === 'assistant') as any

            const settled = !!(
                latestAssistant
                && (latestAssistant.info?.time?.created || 0) >= (startedAt - 1000)
                && (
                    latestAssistant.info?.time?.completed
                    || latestAssistant.info?.error
                )
            )

            set((state) => ({
                chats: {
                    ...state.chats,
                    [performerId]: mapped,
                },
                ...(settled
                    ? { loadingPerformerId: state.loadingPerformerId === performerId ? null : state.loadingPerformerId }
                    : {}),
            }))

            if (!settled && attempt < maxAttempts) {
                scheduleSessionFallbackSync(set, get, performerId, sessionId, startedAt, attempt + 1)
            }
        } catch {
            if (attempt < maxAttempts) {
                scheduleSessionFallbackSync(set, get, performerId, sessionId, startedAt, attempt + 1)
            }
        }
    }, delay)
}
