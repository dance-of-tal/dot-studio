/**
 * Event Reducer — Phase 2
 *
 * Pure reducer functions that apply SSE events to the session entity store.
 * Replaces integration-message-handlers.ts and integration-session-handlers.ts.
 *
 * Each handler reads/writes via the SessionSlice actions rather than
 * module-level Maps.
 */
import type { StudioState } from '../types'
import type { SessionStatus } from './types'
import type { ChatMessage, ChatMessagePart } from '../../types'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'

// ── Shared types ──

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
    const next = { ...record }
    delete next[key]
    return next
}

/** Resolve sessionId → sessionId (confirmed it exists in entity store). */
function hasSession(state: StudioState, sessionId: string): boolean {
    return !!(state.sessionToChatKey[sessionId] || state.seEntities[sessionId] || state.seMessages[sessionId])
}

// ── Message Reducers ──

export function reduceMessageUpdated(
    sessionId: string,
    messageId: string,
    role: string,
    createdAt: number | undefined,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    const updated = upsertMessageEnvelope(
        messages,
        messageId,
        role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant',
        createdAt || Date.now(),
    )
    set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
}

export function reduceMessageRemoved(
    sessionId: string,
    messageId: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    set({
        seMessages: {
            ...state.seMessages,
            [sessionId]: messages.filter((m) => m.id !== messageId),
        },
    })
}

export function reduceMessagePartUpdated(
    sessionId: string,
    messageId: string,
    part: {
        id: string
        type?: string
        text?: string
        tool?: string
        callID?: string
        state?: {
            status?: 'pending' | 'running' | 'completed' | 'error'
            title?: string
            input?: unknown
            output?: unknown
            error?: unknown
            time?: { start: number; end?: number }
        }
        reason?: string
        cost?: unknown
        tokens?: unknown
        auto?: boolean
        overflow?: unknown
    },
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []

    if (part.type === 'text') {
        const textPart: ChatMessagePart = {
            id: part.id,
            type: 'text',
            content: typeof part.text === 'string' ? part.text : '',
        }
        const updated = upsertMessagePart(messages, messageId, textPart)
        set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
        return
    }

    if (part.type === 'reasoning') {
        const reasoningPart: ChatMessagePart = {
            id: part.id,
            type: 'reasoning',
            content: typeof part.text === 'string' ? part.text : '',
        }
        const updated = upsertMessagePart(messages, messageId, reasoningPart)
        set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
        return
    }

    if (part.type === 'tool') {
        const s = part.state || {}
        const toolPart: ChatMessagePart = {
            id: part.id,
            type: 'tool',
            tool: {
                name: part.tool || 'unknown',
                callId: part.callID || part.id,
                status: s.status || 'pending',
                title: s.title,
                input: s.input as Record<string, unknown> | undefined,
                output: s.output as string | undefined,
                error: s.error as string | undefined,
                time: s.time,
            },
        }
        const updated = upsertMessagePart(messages, messageId, toolPart)
        set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
        return
    }

    if (part.type === 'step-start' || part.type === 'step-finish') {
        const stepPart: ChatMessagePart = {
            id: part.id,
            type: part.type,
            step: part.type === 'step-finish'
                ? {
                    reason: part.reason,
                    cost: typeof part.cost === 'number' ? part.cost : undefined,
                    tokens: part.tokens as ChatMessagePart['step'] extends { tokens?: infer T } ? T : never,
                }
                : undefined,
        }
        const updated = upsertMessagePart(messages, messageId, stepPart)
        set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
        return
    }

    if (part.type === 'compaction') {
        const compactionPart: ChatMessagePart = {
            id: part.id,
            type: 'compaction',
            compaction: { auto: !!part.auto, overflow: part.overflow as boolean | undefined },
        }
        const updated = upsertMessagePart(messages, messageId, compactionPart)
        set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
    }
}

export function reduceMessagePartDelta(
    sessionId: string,
    messageId: string,
    partId: string,
    delta: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []

    // Find existing part to determine kind
    const existingMsg = messages.find((m) => m.id === messageId)
    const existingPart = existingMsg?.parts?.find((p) => p.id === partId)

    if (existingPart?.type === 'reasoning') {
        // Append delta to reasoning part
        const updated = upsertMessagePart(messages, messageId, {
            ...existingPart,
            content: (existingPart.content || '') + delta,
        })
        set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
        return
    }

    const existingTextContent = existingPart?.type === 'text'
        ? existingPart.content || ''
        : (
            existingMsg && !(existingMsg.parts || []).some((part) => part.type === 'text')
                ? existingMsg.content || ''
                : ''
        )
    const updated = upsertMessagePart(messages, messageId, {
        id: partId,
        type: 'text',
        content: existingTextContent + delta,
    })
    set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
}

export function reduceMessagePartRemoved(
    sessionId: string,
    messageId: string,
    partId: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    const updated = removeMessagePartFromMessages(messages, messageId, partId)
    set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
}

// ── Session Status Reducers ──

export function reduceSessionStatus(
    sessionId: string,
    status: SessionStatus,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    set({
        seStatuses: { ...state.seStatuses, [sessionId]: status },
        sessionLoading: withoutKey(state.sessionLoading, sessionId),
    })

    if (status.type === 'busy') {
        // Clean up retry messages
        const messages = get().seMessages[sessionId] || []
        const retryMsgId = `retry-${sessionId}`
        if (messages.some((m) => m.id === retryMsgId)) {
            set({
                seMessages: {
                    ...get().seMessages,
                    [sessionId]: messages.filter((m) => m.id !== retryMsgId),
                },
            })
        }
    }

    if (status.type === 'idle') {
        // Clean up retry messages
        const messages = get().seMessages[sessionId] || []
        const retryMsgId = `retry-${sessionId}`
        if (messages.some((m) => m.id === retryMsgId)) {
            set({
                seMessages: {
                    ...get().seMessages,
                    [sessionId]: messages.filter((m) => m.id !== retryMsgId),
                },
            })
        }
    }

    if (status.type === 'retry') {
        const messages = get().seMessages[sessionId] || []
        const retryMsgId = `retry-${sessionId}`
        const retryContent = `⏳ Retrying (Attempt ${status.attempt}): ${status.message || 'Operation failed, retrying...'}`
        const retryIndex = messages.findIndex((m) => m.id === retryMsgId)
        if (retryIndex >= 0) {
            const next = [...messages]
            next[retryIndex] = { ...next[retryIndex], content: retryContent }
            set({ seMessages: { ...get().seMessages, [sessionId]: next } })
        } else {
            set({
                seMessages: {
                    ...get().seMessages,
                    [sessionId]: [...messages, {
                        id: retryMsgId,
                        role: 'system' as const,
                        content: retryContent,
                        timestamp: Date.now(),
                    }],
                },
            })
        }
    }
}

export function reduceSessionError(
    sessionId: string,
    errorMessage: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const restLoading = withoutKey(state.sessionLoading, sessionId)
    set({
        sessionLoading: restLoading,
        seStatuses: { ...state.seStatuses, [sessionId]: { type: 'error', message: errorMessage } },
    })

    const messages = get().seMessages[sessionId] || []
    // Mark stale running/pending tool parts as error
    const finalized = messages.map((msg) => {
        if (!msg.parts) return msg
        const hasStale = msg.parts.some(
            (p) => p.type === 'tool' && p.tool && (p.tool.status === 'running' || p.tool.status === 'pending'),
        )
        if (!hasStale) return msg
        return {
            ...msg,
            parts: msg.parts.map((p) =>
                p.type === 'tool' && p.tool && (p.tool.status === 'running' || p.tool.status === 'pending')
                    ? { ...p, tool: { ...p.tool, status: 'error' as const } }
                    : p,
            ),
        }
    })

    set({
        seMessages: {
            ...get().seMessages,
            [sessionId]: [
                ...finalized,
                {
                    id: `system-${Date.now()}`,
                    role: 'system' as const,
                    content: `⚠️ ${errorMessage}`,
                    timestamp: Date.now(),
                },
            ],
        },
    })
}

// ── Permission / Question / Todo Reducers ──

export function reducePermissionAsked(
    sessionId: string,
    permission: PermissionRequest,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const restLoading = withoutKey(state.sessionLoading, sessionId)
    set({
        sePermissions: { ...state.sePermissions, [sessionId]: permission },
        sessionLoading: restLoading,
    })
}

export function reducePermissionReplied(
    sessionId: string,
    _get: GetFn,
    set: SetFn,
) {
    set((state) => {
        return { sePermissions: withoutKey(state.sePermissions, sessionId) }
    })
}

export function reduceQuestionAsked(
    sessionId: string,
    question: QuestionRequest,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const restLoading = withoutKey(state.sessionLoading, sessionId)
    set({
        seQuestions: { ...state.seQuestions, [sessionId]: question },
        sessionLoading: restLoading,
    })
}

export function reduceQuestionReplied(
    sessionId: string,
    _get: GetFn,
    set: SetFn,
) {
    set((state) => {
        return { seQuestions: withoutKey(state.seQuestions, sessionId) }
    })
}

export function reduceTodoUpdated(
    sessionId: string,
    todos: Todo[],
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    set({
        seTodos: {
            ...state.seTodos,
            [sessionId]: todos,
        },
    })
}

// ── Internal helpers ──

function upsertMessagePart(messages: ChatMessage[], messageId: string, part: ChatMessagePart): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((m) => m.id === messageId)
    if (idx === -1) {
        const created: ChatMessage = {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            parts: [part],
        }
        next.push(applyMessageParts(created, [part], { preserveContentWithoutTextParts: false }))
        return next
    }

    const message = next[idx]
    const existingParts = message.parts ? [...message.parts] : []
    const partIdx = existingParts.findIndex((p) => p.id === part.id)
    if (partIdx === -1) {
        existingParts.push(part)
    } else {
        existingParts[partIdx] = part
    }
    next[idx] = applyMessageParts(message, existingParts, {
        preserveContentWithoutTextParts: part.type !== 'text' && !hasTextParts(message.parts || []),
    })
    return next
}

function removeMessagePartFromMessages(messages: ChatMessage[], messageId: string, partId: string): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((m) => m.id === messageId)
    if (idx === -1) return next

    const message = next[idx]
    if (!message.parts?.length) return next

    const removedPart = message.parts.find((part) => part.id === partId)
    const nextParts = message.parts.filter((p) => p.id !== partId)
    next[idx] = applyMessageParts(message, nextParts, {
        preserveContentWithoutTextParts: removedPart?.type !== 'text',
    })
    return next
}

function hasTextParts(parts: ChatMessagePart[]) {
    return parts.some((part) => part.type === 'text')
}

function buildContentFromTextParts(parts: ChatMessagePart[]) {
    return parts
        .filter((part) => part.type === 'text')
        .map((part) => part.content || '')
        .join('\n')
}

function applyMessageParts(
    message: ChatMessage,
    parts: ChatMessagePart[],
    options: { preserveContentWithoutTextParts: boolean },
): ChatMessage {
    if (hasTextParts(parts)) {
        return {
            ...message,
            parts,
            content: buildContentFromTextParts(parts),
        }
    }

    return {
        ...message,
        parts,
        content: options.preserveContentWithoutTextParts ? message.content : '',
    }
}

function findLatestTempUserMessageIndex(messages: ChatMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index]
        if (message.role === 'user' && message.id.startsWith('temp-')) {
            return index
        }
    }
    return -1
}

function upsertMessageEnvelope(
    messages: ChatMessage[],
    messageId: string,
    role: ChatMessage['role'],
    timestamp: number,
): ChatMessage[] {
    const next = [...messages]
    const existingIndex = next.findIndex((message) => message.id === messageId)
    if (existingIndex >= 0) {
        next[existingIndex] = {
            ...next[existingIndex],
            role,
            timestamp,
        }
        return next
    }

    if (role === 'user') {
        const tempIndex = findLatestTempUserMessageIndex(next)
        if (tempIndex >= 0) {
            next[tempIndex] = {
                ...next[tempIndex],
                id: messageId,
                role,
                timestamp,
            }
            return next
        }
    }

    next.push({
        id: messageId,
        role,
        content: '',
        timestamp,
    })
    return next
}
