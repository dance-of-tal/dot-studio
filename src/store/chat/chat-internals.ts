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
    // Only carry forward system-role prefix messages (e.g. mode-switch notices)
    // that aren't already present in the server-synced messages.
    // User/assistant messages from previously detached sessions must NOT be
    // prepended — the server response already contains the full session history.
    set((state) => {
        const serverIds = new Set(mapped.map((m) => m.id))
        const systemPrefixes = (state.chatPrefixes[performerId] || []).filter(
            (prefix) => prefix.role === 'system' && !serverIds.has(prefix.id),
        )
        return {
            chats: {
                ...state.chats,
                [performerId]: [
                    ...systemPrefixes,
                    ...mapped,
                ],
            },
        }
    })
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
            } else if (!settled && attempt >= maxAttempts) {
                // All retries exhausted — force-clear loading to prevent
                // infinite spinner. The SSE stream may pick up later events
                // and the user can always re-send.
                set((state) => ({
                    loadingPerformerId: state.loadingPerformerId === performerId ? null : state.loadingPerformerId,
                }))
            }
        } catch {
            if (attempt < maxAttempts) {
                scheduleSessionFallbackSync(set, get, performerId, sessionId, startedAt, attempt + 1)
            } else {
                // All retries exhausted on error — force-clear loading.
                set((state) => ({
                    loadingPerformerId: state.loadingPerformerId === performerId ? null : state.loadingPerformerId,
                }))
            }
        }
    }, delay)
}
