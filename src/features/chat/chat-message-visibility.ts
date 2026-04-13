import type { ChatMessage } from '../../types'

export function hasVisibleUserMessageContent(message: Pick<ChatMessage, 'content' | 'attachments'>): boolean {
    if ((message.content || '').trim()) {
        return true
    }

    return !!message.attachments?.length
}

export function hasVisibleAssistantMessageContent(message: Pick<ChatMessage, 'content' | 'parts'>): boolean {
    const visibleText = (message.content || '').trim()
    if (visibleText) {
        return true
    }

    return !!message.parts?.some((part) =>
        part.type === 'tool'
        || part.type === 'compaction'
        || (part.type === 'reasoning' && !!part.content?.trim()),
    )
}

export function shouldShowAssistantLoadingPlaceholder(
    messages: Array<Pick<ChatMessage, 'role' | 'content' | 'parts'>>,
    isLoading: boolean,
): boolean {
    if (!isLoading) {
        return false
    }

    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') {
        return true
    }

    return !hasVisibleAssistantMessageContent(lastMsg)
}

export function isStreamingAssistantMessage(
    messages: Array<Pick<ChatMessage, 'role'>>,
    index: number,
    isLoading: boolean,
): boolean {
    if (!isLoading) {
        return false
    }

    const message = messages[index]
    return !!message && message.role === 'assistant' && index === messages.length - 1
}
