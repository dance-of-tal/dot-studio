import type { ChatMessage } from '../../types'

export function hasVisibleUserMessageContent(message: Pick<ChatMessage, 'content' | 'attachments'>): boolean {
    if ((message.content || '').trim()) {
        return true
    }

    return !!message.attachments?.length
}
