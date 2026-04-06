import type { ChatMessage, ChatMessagePart } from '../types'
import { extractAssistantActionEnvelope } from '../features/assistant/assistant-protocol'

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

export type SessionMessageLike = {
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

function readSessionString(value: unknown, ...keys: string[]): string | null {
    let current: unknown = value
    for (const key of keys) {
        if (!current || typeof current !== 'object' || !(key in current)) {
            return null
        }
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'string' && current.trim() ? current : null
}

function readSessionBoolean(value: unknown, ...keys: string[]): boolean | null {
    let current: unknown = value
    for (const key of keys) {
        if (!current || typeof current !== 'object' || !(key in current)) {
            return null
        }
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'boolean' ? current : null
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

    if (part.type === 'text') {
        return {
            id: part.id,
            type: 'text',
            content: part.text || '',
        }
    }

    if (part.type === 'reasoning') {
        return {
            id: part.id,
            type: 'reasoning',
            content: part.text || '',
        }
    }

    if (part.type === 'tool') {
        const s = part.state || {}
        const status = s.status === 'pending' || s.status === 'running' || s.status === 'completed' || s.status === 'error'
            ? s.status
            : 'pending'
        return {
            id: part.id,
            type: 'tool',
            tool: {
                name: part.tool || 'unknown',
                callId: part.callID || part.id,
                status,
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

// Context sections are joined by this separator in chat-service.ts:
// const promptSections = [assistantContextPrefix, request.message].filter(Boolean)
// They are joined as: promptSections.join('\n\n---\n\n')
// When syncing from server, user messages may contain the full composed prompt.
// Strip the injected context sections to show only the user's original input.
const PROMPT_SECTION_SEPARATOR = '\n\n---\n\n'

function stripInjectedContextFromUserMessage(text: string): string {
    const lastSeparatorIndex = text.lastIndexOf(PROMPT_SECTION_SEPARATOR)
    if (lastSeparatorIndex === -1) return text
    return text.slice(lastSeparatorIndex + PROMPT_SECTION_SEPARATOR.length)
}

export function mapSessionMessageToChatMessage(message: SessionMessageLike): ChatMessage {
    // Build text content from text parts
    const rawRole = message.info?.role || message.role || 'assistant'
    const rawTextContent = message.parts
        ?.filter((part) => part.type === 'text')
        .map((part) => part.text || '')
        .join('\n') || message.text || ''
    // Strip auto-injected context prefixes from user messages.
    // The server joins context sections with '\n\n---\n\n', user text is always last.
    const strippedText = rawRole === 'user'
        ? stripInjectedContextFromUserMessage(rawTextContent)
        : rawTextContent
    const errorContent = extractAssistantErrorMessage(message)
    const parsedAssistantEnvelope = extractAssistantActionEnvelope(strippedText.trim() || errorContent || '')
    const textContent = parsedAssistantEnvelope.content
    const role = (
        errorContent && rawRole === 'assistant'
            ? 'system'
            : rawRole
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
        ...(parsedAssistantEnvelope.envelope?.actions.length
            ? {
                metadata: {
                    assistantActions: parsedAssistantEnvelope.envelope.actions,
                },
            }
            : {}),
    }
}

export function mapSessionMessagesToChatMessages(messages: SessionMessageLike[]): ChatMessage[] {
    return messages.map(mapSessionMessageToChatMessage)
}

export function mergeSystemPrefixMessages(
    prefixes: ChatMessage[] | undefined,
    messages: ChatMessage[],
): ChatMessage[] {
    if (!prefixes?.length) {
        return messages
    }

    const serverIds = new Set(messages.map((message) => message.id))
    const systemPrefixes = prefixes.filter(
        (prefix) => prefix.role === 'system' && !serverIds.has(prefix.id),
    )

    if (systemPrefixes.length === 0) {
        return messages
    }

    return [...systemPrefixes, ...messages]
}

const OPTIMISTIC_USER_MIRROR_WINDOW_MS = 30_000

function buildAttachmentSignature(message: ChatMessage): string {
    return (message.attachments || [])
        .map((attachment) => `${attachment.type}:${attachment.filename || ''}:${attachment.mime || ''}`)
        .join('|')
}

function isOptimisticUserMessage(message: ChatMessage): boolean {
    return message.role === 'user' && message.id.startsWith('temp-')
}

function isPersistedUserMessage(message: ChatMessage): boolean {
    return message.role === 'user' && !message.id.startsWith('temp-')
}

function hasMatchingServerUserMessage(serverMessages: ChatMessage[], optimisticMessage: ChatMessage): boolean {
    const optimisticAttachmentSignature = buildAttachmentSignature(optimisticMessage)
    return serverMessages.some((message) => (
        isPersistedUserMessage(message)
        && message.content === optimisticMessage.content
        && buildAttachmentSignature(message) === optimisticAttachmentSignature
        && Math.abs(message.timestamp - optimisticMessage.timestamp) < OPTIMISTIC_USER_MIRROR_WINDOW_MS
    ))
}

export function mergePendingOptimisticUserMessages(
    serverMessages: ChatMessage[],
    currentMessages: ChatMessage[],
    keepPendingOptimisticMessages: boolean,
): ChatMessage[] {
    if (!keepPendingOptimisticMessages || currentMessages.length === 0) {
        return serverMessages
    }

    const optimisticMessages = currentMessages.filter(isOptimisticUserMessage)
    if (optimisticMessages.length === 0) {
        return serverMessages
    }

    const merged = [...serverMessages]
    for (const optimisticMessage of optimisticMessages) {
        if (!hasMatchingServerUserMessage(serverMessages, optimisticMessage)) {
            merged.push(optimisticMessage)
        }
    }

    return merged.sort((left, right) => left.timestamp - right.timestamp)
}

function isLiveAssistantLikeMessage(message: ChatMessage) {
    return (
        (message.role === 'assistant' || message.role === 'system')
        && !message.id.startsWith('temp-')
    )
}

function chooseLongerString(left: string | undefined, right: string | undefined) {
    return (right || '').length > (left || '').length ? right : left
}

function mergeAssistantLikeParts(
    serverParts: ChatMessage['parts'],
    currentParts: ChatMessage['parts'],
): ChatMessage['parts'] {
    if (!serverParts?.length) {
        return currentParts?.length ? currentParts : undefined
    }
    if (!currentParts?.length) {
        return serverParts
    }

    const currentById = new Map(currentParts.map((part) => [part.id, part]))
    const merged = serverParts.map((serverPart) => {
        const currentPart = currentById.get(serverPart.id)
        if (!currentPart || currentPart.type !== serverPart.type) {
            return serverPart
        }

        if ((serverPart.type === 'text' || serverPart.type === 'reasoning')) {
            return {
                ...serverPart,
                content: chooseLongerString(serverPart.content, currentPart.content) || '',
            }
        }

        if (serverPart.type === 'tool' && serverPart.tool && currentPart.tool) {
            const statusRank = { pending: 0, running: 1, completed: 2, error: 2 } as const
            const preferredTool = statusRank[currentPart.tool.status] > statusRank[serverPart.tool.status]
                ? currentPart.tool
                : serverPart.tool

            return {
                ...serverPart,
                tool: {
                    ...preferredTool,
                    title: chooseLongerString(serverPart.tool.title, currentPart.tool.title),
                    output: chooseLongerString(serverPart.tool.output, currentPart.tool.output),
                    error: chooseLongerString(serverPart.tool.error, currentPart.tool.error),
                    input: currentPart.tool.input || serverPart.tool.input,
                    time: currentPart.tool.time || serverPart.tool.time,
                },
            }
        }

        return currentPart
    })

    for (const currentPart of currentParts) {
        if (!merged.some((part) => part.id === currentPart.id)) {
            merged.push(currentPart)
        }
    }

    return merged
}

function mergeInFlightAssistantLikeMessage(serverMessage: ChatMessage, currentMessage: ChatMessage): ChatMessage {
    return {
        ...serverMessage,
        content: chooseLongerString(serverMessage.content, currentMessage.content) || '',
        parts: mergeAssistantLikeParts(serverMessage.parts, currentMessage.parts),
        metadata: serverMessage.metadata || currentMessage.metadata,
    }
}

function mergeInFlightAssistantMessages(
    serverMessages: ChatMessage[],
    currentMessages: ChatMessage[],
    keepLiveAssistantMessages: boolean,
): ChatMessage[] {
    if (!keepLiveAssistantMessages || currentMessages.length === 0) {
        return serverMessages
    }

    const currentById = new Map(currentMessages.map((message) => [message.id, message]))
    const merged = serverMessages.map((serverMessage) => {
        const currentMessage = currentById.get(serverMessage.id)
        if (!currentMessage) {
            return serverMessage
        }
        if (!isLiveAssistantLikeMessage(serverMessage) || !isLiveAssistantLikeMessage(currentMessage)) {
            return serverMessage
        }
        return mergeInFlightAssistantLikeMessage(serverMessage, currentMessage)
    })

    for (const currentMessage of currentMessages) {
        if (!isLiveAssistantLikeMessage(currentMessage)) {
            continue
        }
        if (!merged.some((message) => message.id === currentMessage.id)) {
            merged.push(currentMessage)
        }
    }

    return merged.sort((left, right) => left.timestamp - right.timestamp)
}

export function mergeLiveSessionSnapshot(
    serverMessages: ChatMessage[],
    currentMessages: ChatMessage[],
    options: {
        preserveOptimisticUserMessages: boolean
        preserveStreamingAssistantMessages: boolean
    },
): ChatMessage[] {
    const withOptimisticUsers = mergePendingOptimisticUserMessages(
        serverMessages,
        currentMessages,
        options.preserveOptimisticUserMessages,
    )

    return mergeInFlightAssistantMessages(
        withOptimisticUsers,
        currentMessages,
        options.preserveStreamingAssistantMessages,
    )
}

export function extractLatestNonRetryableAssistantError(
    sessionMessages: SessionMessageLike[],
): { id: string; message: string } | null {
    for (let i = sessionMessages.length - 1; i >= 0; i--) {
        const message = sessionMessages[i]
        const role = readSessionString(message, 'info', 'role') || readSessionString(message, 'role')
        if (role !== 'assistant') {
            continue
        }

        const retryable = readSessionBoolean(message, 'info', 'error', 'data', 'isRetryable')
        const errorMessage = readSessionString(message, 'info', 'error', 'data', 'message')
            || readSessionString(message, 'info', 'error', 'message')
        const id = readSessionString(message, 'info', 'id') || readSessionString(message, 'id')

        if (retryable === false && errorMessage && id) {
            return { id, message: errorMessage }
        }
    }

    return null
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
