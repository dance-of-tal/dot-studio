/**
 * Chat slice internal utilities and types shared across sub-modules.
 */
import type { StudioState } from '../types'
import type { ChatMessage, PerformerNode } from '../../types'
import {
    appendLocalMessage,
    appendSystemNotice,
    resolveChatKeySession,
    syncSessionSnapshot,
} from '../session'

export type ChatGet = () => StudioState
export type ChatSet = (fn: ((state: StudioState) => Partial<StudioState>) | Partial<StudioState>) => void

export function getPerformerById(get: ChatGet, performerId: string): PerformerNode | null {
    return get().performers.find((item) => item.id === performerId) || null
}

export function getPerformerSessionId(get: ChatGet, performerId: string): string | undefined {
    return resolveChatKeySession(get, performerId) || undefined
}

export function addChatMessage(set: ChatSet, _get: ChatGet, performerId: string, msg: ChatMessage) {
    void set
    appendLocalMessage(_get, performerId, msg)
}

export function appendPerformerSystemMessage(set: ChatSet, _get: ChatGet, performerId: string, content: string) {
    void set
    appendSystemNotice(_get, performerId, content)
}

export async function syncPerformerMessages(
    set: ChatSet,
    get: ChatGet,
    performerId: string,
    sessionId: string,
) {
    return syncSessionSnapshot(set, get, performerId, sessionId)
}
