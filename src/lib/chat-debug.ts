import type { ChatMessage } from '../types'

const CHAT_DEBUG_STORAGE_KEY = 'dot-chat-debug'

function readStorageFlag(storage: Storage | undefined) {
    if (!storage) return false
    try {
        const value = storage.getItem(CHAT_DEBUG_STORAGE_KEY)
        return value === '1' || value === 'true' || value === 'on'
    } catch {
        return false
    }
}

export function isChatDebugEnabled() {
    if (typeof window === 'undefined') {
        return false
    }

    const fromWindow = (window as Window & { __DOT_CHAT_DEBUG__?: unknown }).__DOT_CHAT_DEBUG__
    if (fromWindow === true) {
        return true
    }

    return readStorageFlag(window.localStorage) || readStorageFlag(window.sessionStorage)
}

export function logChatDebug(scope: string, message: string, details?: Record<string, unknown>) {
    if (!isChatDebugEnabled()) {
        return
    }

    if (details) {
        console.debug(`[chat-debug:${scope}] ${message}`, details)
        return
    }

    console.debug(`[chat-debug:${scope}] ${message}`)
}

export function summarizeMessagesForChatDebug(messages: ChatMessage[]) {
    const tail = messages.slice(-5).map((message) => ({
        id: message.id,
        role: message.role,
        contentLength: message.content.length,
        timestamp: message.timestamp,
    }))

    return {
        count: messages.length,
        tail,
    }
}
