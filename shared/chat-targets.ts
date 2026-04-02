export const ASSISTANT_CHAT_OWNER_ID = 'studio-assistant'

export type ChatTargetDescriptor =
    | {
        kind: 'performer'
        chatKey: string
        performerId: string
    }
    | {
        kind: 'assistant'
        chatKey: string
    }
    | {
        kind: 'act-participant'
        chatKey: string
        actId: string
        threadId: string
        participantKey: string
    }

export function buildActParticipantChatKey(actId: string, threadId: string, participantKey: string) {
    return `act:${actId}:thread:${threadId}:participant:${participantKey}`
}

export function parseActParticipantChatKey(chatKey: string) {
    const match = chatKey.match(/^act:([^:]+):thread:([^:]+):participant:(.+)$/)
    if (!match) {
        return null
    }

    const [, actId, threadId, participantKey] = match
    return {
        actId,
        threadId,
        participantKey,
    }
}

export function isActParticipantChatKey(chatKey: string) {
    return parseActParticipantChatKey(chatKey) !== null
}

export function hashWorkspaceKey(input: string) {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
}

export function buildAssistantChatKey(workingDir: string | null | undefined) {
    const normalized = workingDir?.trim()
    if (!normalized) {
        return ASSISTANT_CHAT_OWNER_ID
    }
    return `${ASSISTANT_CHAT_OWNER_ID}--${hashWorkspaceKey(normalized)}`
}

export function isAssistantChatKey(chatKey: string) {
    return chatKey === ASSISTANT_CHAT_OWNER_ID || chatKey.startsWith(`${ASSISTANT_CHAT_OWNER_ID}--`)
}

export function describeChatTarget(chatKey: string): ChatTargetDescriptor {
    if (isAssistantChatKey(chatKey)) {
        return {
            kind: 'assistant',
            chatKey,
        }
    }

    const actParticipant = parseActParticipantChatKey(chatKey)
    if (actParticipant) {
        return {
            kind: 'act-participant',
            chatKey,
            ...actParticipant,
        }
    }

    return {
        kind: 'performer',
        chatKey,
        performerId: chatKey,
    }
}
