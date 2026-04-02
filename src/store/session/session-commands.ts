import { api } from '../../api'
import type { ChatMessage } from '../../types'
import type { StudioState } from '../types'
import { logChatDebug, summarizeMessagesForChatDebug } from '../../lib/chat-debug'
import {
    mapSessionMessagesToChatMessages,
    mergePendingOptimisticUserMessages,
} from '../../lib/chat-messages'
import {
    describeChatTarget,
    type ChatTargetDescriptor,
} from '../../../shared/chat-targets'
import { selectMessagesForChatKey } from './session-selectors'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

function createSessionEntity(sessionId: string, title?: string) {
    return {
        id: sessionId,
        ...(title ? { title } : {}),
        status: { type: 'idle' as const },
        createdAt: Date.now(),
    }
}

async function createRemoteSession(
    target: ChatTargetDescriptor,
    title?: string,
) {
    const createResult = await api.chat.createSession(
        target.chatKey,
        title || target.chatKey,
        '',
        target.kind === 'act-participant' ? target.actId : undefined,
    )

    return {
        sessionId: createResult.sessionId,
        title: title || createResult.title,
    }
}

function syncActThreadBinding(set: SetState, descriptor: ChatTargetDescriptor, sessionId: string | null) {
    if (descriptor.kind !== 'act-participant') {
        return
    }

    set((state) => ({
        actThreads: {
            ...state.actThreads,
            [descriptor.actId]: (state.actThreads[descriptor.actId] || []).map((thread) =>
                thread.id !== descriptor.threadId
                    ? thread
                    : {
                        ...thread,
                        participantSessions: sessionId
                            ? {
                                ...thread.participantSessions,
                                [descriptor.participantKey]: sessionId,
                            }
                            : Object.fromEntries(
                                Object.entries(thread.participantSessions).filter(([key]) => key !== descriptor.participantKey),
                            ),
                    },
            ),
        },
    }))
}

export function registerSessionBinding(
    set: SetState,
    get: GetState,
    chatKey: string,
    sessionId: string,
    options?: { title?: string; clearDrafts?: boolean },
) {
    get().registerBinding(chatKey, sessionId)
    if (!get().seEntities[sessionId]) {
        get().upsertSession(createSessionEntity(sessionId, options?.title))
    } else if (options?.title && get().seEntities[sessionId].title !== options.title) {
        get().upsertSession({ ...get().seEntities[sessionId], title: options.title })
    }
    if (options?.clearDrafts !== false) {
        get().clearChatDraftMessages(chatKey)
    }
    syncActThreadBinding(set, describeChatTarget(chatKey), sessionId)
}

export function detachChatSession(
    set: SetState,
    get: GetState,
    chatKey: string,
    options?: { notice?: string; keepVisibleMessages?: boolean },
) {
    const sessionId = get().chatKeyToSession[chatKey] || null
    const visibleMessages = options?.keepVisibleMessages === false
        ? []
        : selectMessagesForChatKey(get(), chatKey)

    const nextMessages = options?.notice
        ? [
            ...visibleMessages,
            {
                id: `msg-${Date.now()}`,
                role: 'system' as const,
                content: options.notice,
                timestamp: Date.now(),
            },
        ]
        : visibleMessages

    get().setChatDraftMessages(chatKey, nextMessages)
    get().setChatPrefixMessages(
        chatKey,
        nextMessages.filter((message) => message.role === 'system'),
    )

    if (sessionId) {
        get().unregisterBinding(chatKey)
        get().clearSessionRevert(sessionId)
    }
    syncActThreadBinding(set, describeChatTarget(chatKey), null)
}

export async function syncSessionSnapshot(
    _set: SetState,
    get: GetState,
    chatKey: string,
    sessionId: string,
) {
    const response = await api.chat.messages(sessionId)
    const mapped = mapSessionMessagesToChatMessages(response.messages)
    const currentMessages = get().seMessages[sessionId] || []
    const nextMessages = mergePendingOptimisticUserMessages(mapped, currentMessages, !!get().sessionLoading[sessionId])

    registerSessionBinding(_set, get, chatKey, sessionId)
    get().setSessionMessages(sessionId, nextMessages)
    logChatDebug('snapshot', 'sync complete', {
        chatKey,
        sessionId,
        nextCursor: response.nextCursor,
        messages: summarizeMessagesForChatDebug(nextMessages),
    })
    return {
        messages: nextMessages,
        nextCursor: response.nextCursor,
    }
}

export async function bindExistingSession(
    set: SetState,
    get: GetState,
    chatKey: string,
    sessionId: string,
    options?: { title?: string; sync?: boolean },
) {
    registerSessionBinding(set, get, chatKey, sessionId, { title: options?.title })
    if (options?.sync === false) {
        return {
            messages: get().seMessages[sessionId] || [],
            nextCursor: null,
        }
    }
    return syncSessionSnapshot(set, get, chatKey, sessionId)
}

export async function createFreshSessionBinding(
    set: SetState,
    get: GetState,
    target: ChatTargetDescriptor,
    options?: { title?: string; clearDrafts?: boolean },
) {
    const created = await createRemoteSession(target, options?.title)
    registerSessionBinding(set, get, target.chatKey, created.sessionId, {
        title: created.title,
        clearDrafts: options?.clearDrafts,
    })
    return created.sessionId
}

export async function ensureSession(
    set: SetState,
    get: GetState,
    target: ChatTargetDescriptor,
    options?: { title?: string; clearDrafts?: boolean },
) {
    const existing = get().chatKeyToSession[target.chatKey]
    if (existing) {
        registerSessionBinding(set, get, target.chatKey, existing, {
            title: options?.title,
            clearDrafts: options?.clearDrafts,
        })
        return existing
    }

    const created = await createRemoteSession(target, options?.title)
    registerSessionBinding(set, get, target.chatKey, created.sessionId, {
        title: created.title,
        clearDrafts: options?.clearDrafts,
    })
    return created.sessionId
}

export function appendLocalMessage(get: GetState, chatKey: string, message: ChatMessage) {
    const sessionId = get().chatKeyToSession[chatKey]
    if (sessionId) {
        get().appendSessionMessage(sessionId, message)
        return
    }
    get().appendChatDraftMessage(chatKey, message)
}

export function appendSystemNotice(get: GetState, chatKey: string, content: string) {
    const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'system',
        content,
        timestamp: Date.now(),
    }

    const sessionId = get().chatKeyToSession[chatKey]
    if (sessionId) {
        get().appendSessionMessage(sessionId, message)
    } else {
        get().appendChatDraftMessage(chatKey, message)
    }
    get().appendChatPrefixMessage(chatKey, message)
}

export function moveDraftMessageToSession(
    _set: SetState,
    get: GetState,
    chatKey: string,
    sessionId: string,
    messageId: string,
) {
    const draftMessages = get().chatDrafts[chatKey] || []
    const draftMessage = draftMessages.find((message) => message.id === messageId)
    if (!draftMessage) {
        return
    }
    get().removeChatDraftMessage(chatKey, messageId)
    get().appendSessionMessage(sessionId, draftMessage)
}

export function clearChatSessionView(get: GetState, chatKey: string) {
    const sessionId = get().chatKeyToSession[chatKey]
    if (sessionId) {
        get().clearSessionData(sessionId)
        get().unregisterBinding(chatKey)
    }
    get().clearChatDraftMessages(chatKey)
    get().clearChatPrefixMessages(chatKey)
}

export function resolveChatKeySession(get: GetState, chatKey: string) {
    return get().chatKeyToSession[chatKey] || null
}
