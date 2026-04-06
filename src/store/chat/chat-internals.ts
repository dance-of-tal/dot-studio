/**
 * Chat slice internal utilities and types shared across sub-modules.
 */
import type { StudioState } from '../types'
import type { ChatMessage } from '../../types'
import {
    appendLocalMessage,
    appendSystemNotice,
    resolveChatKeySession,
    syncSessionSnapshot,
} from '../session'

export type ChatGet = () => StudioState
export type ChatSet = (fn: ((state: StudioState) => Partial<StudioState>) | Partial<StudioState>) => void

export function getChatSessionId(get: ChatGet, chatKey: string): string | undefined {
    return resolveChatKeySession(get, chatKey) || undefined
}

export function appendChatMessage(set: ChatSet, _get: ChatGet, chatKey: string, msg: ChatMessage) {
    void set
    appendLocalMessage(_get, chatKey, msg)
}

export function appendChatSystemMessage(set: ChatSet, _get: ChatGet, chatKey: string, content: string) {
    void set
    appendSystemNotice(_get, chatKey, content)
}

export async function syncChatMessages(
    set: ChatSet,
    get: ChatGet,
    chatKey: string,
    sessionId: string,
) {
    return syncSessionSnapshot(set, get, chatKey, sessionId)
}
