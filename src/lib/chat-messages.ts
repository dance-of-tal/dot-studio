import type { ChatMessage, ChatMessagePart } from '../types'

type SessionPartLike = {
    id?: string
    type?: string
    text?: string
    tool?: string
    callID?: string
    state?: {
        status?: string
        title?: string
        input?: Record<string, unknown>
        output?: string
        error?: string
        time?: { start: number; end?: number }
    }
    reason?: string
    cost?: number
    tokens?: { input: number; output: number; reasoning: number; cache?: { read: number; write: number } }
    auto?: boolean
    overflow?: boolean
}

type SessionMessageLike = {
    id?: string
    role?: string
    info?: {
        id?: string
        role?: string
        error?: {
            data?: {
                message?: string
            }
            message?: string
        }
        time?: {
            created?: number
            completed?: number
        }
    }
    parts?: Array<SessionPartLike>
    text?: string
    created_at?: string
}

function extractAssistantErrorMessage(message: SessionMessageLike): string | null {
    const error = message.info?.error
    if (!error) {
        return null
    }

    if (typeof error.data?.message === 'string' && error.data.message.trim()) {
        return error.data.message.trim()
    }

    if (typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim()
    }

    return 'OpenCode session failed.'
}

function mapPartToChatMessagePart(part: SessionPartLike): ChatMessagePart | null {
    if (!part.id || !part.type) return null

    if (part.type === 'reasoning') {
        return {
            id: part.id,
            type: 'reasoning',
            content: part.text || '',
        }
    }

    if (part.type === 'tool') {
        const s = part.state || {}
        return {
            id: part.id,
            type: 'tool',
            tool: {
                name: part.tool || 'unknown',
                callId: part.callID || part.id,
                status: (s.status as any) || 'pending',
                title: s.title,
                input: s.input,
                output: s.output,
                error: s.error,
                time: s.time,
            },
        }
    }

    if (part.type === 'step-start' || part.type === 'step-finish') {
        return {
            id: part.id,
            type: part.type as 'step-start' | 'step-finish',
            step: part.type === 'step-finish' ? {
                reason: part.reason,
                cost: part.cost,
                tokens: part.tokens ? {
                    input: part.tokens.input,
                    output: part.tokens.output,
                    reasoning: part.tokens.reasoning,
                } : undefined,
            } : undefined,
        }
    }

    if (part.type === 'compaction') {
        return {
            id: part.id,
            type: 'compaction',
            compaction: {
                auto: !!part.auto,
                overflow: part.overflow,
            },
        }
    }

    return null
}

export function mapSessionMessageToChatMessage(message: SessionMessageLike): ChatMessage {
    // Build text content from text parts
    const rawTextContent = message.parts
        ?.filter((part) => part.type === 'text')
        .map((part) => part.text || '')
        .join('\n') || message.text || ''
    const errorContent = extractAssistantErrorMessage(message)
    const textContent = rawTextContent.trim() || errorContent || ''
    const role = (
        errorContent && (message.info?.role || message.role) === 'assistant'
            ? 'system'
            : (message.info?.role || message.role || 'assistant')
    ) as ChatMessage['role']

    // Build structured parts (reasoning, tool, step)
    const structuredParts: ChatMessagePart[] = []
    if (message.parts) {
        for (const part of message.parts) {
            const mapped = mapPartToChatMessagePart(part)
            if (mapped) {
                structuredParts.push(mapped)
            }
        }
    }

    return {
        id: message.info?.id || message.id || `msg-${Date.now()}`,
        role,
        content: textContent,
        timestamp: message.info?.time?.created || Date.parse(message.created_at || new Date().toISOString()),
        ...(structuredParts.length > 0 ? { parts: structuredParts } : {}),
    }
}

export function mapSessionMessagesToChatMessages(messages: SessionMessageLike[]): ChatMessage[] {
    return messages.map(mapSessionMessageToChatMessage)
}

export function upsertAssistantStreamingMessage(
    messages: ChatMessage[],
    messageId: string,
    content: string,
    timestamp = Date.now(),
): ChatMessage[] {
    const next = [...messages]
    const index = next.findIndex((message) => message.id === messageId)
    if (index === -1) {
        next.push({
            id: messageId,
            role: 'assistant',
            content,
            timestamp,
        })
        return next
    }

    next[index] = {
        ...next[index],
        role: 'assistant',
        content,
    }
    return next
}
