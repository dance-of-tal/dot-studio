/**
 * Session Selectors — Phase 1
 *
 * Derived selectors that read from the normalized session entity store.
 * Each selector resolves chatKey → sessionId then reads the entity table.
 * These replace direct reads from the old flat chat/session maps.
 *
 * Entity fields use `se` prefix (seMessages, seStatuses, etc.)
 * to coexist with legacy ChatSlice during migration.
 */
import type { StudioState } from '../types'
import type { ChatMessage } from '../../types'
import type { SessionStatus } from './types'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'
import { mergeSystemPrefixMessages } from '../../lib/chat-messages'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TODOS: Todo[] = []
const IDLE_STATUS: SessionStatus = { type: 'idle' }

// ── Session resolution ──

/**
 * Resolve a chatKey to its sessionId, or null if no binding exists.
 */
export function selectSessionIdForChatKey(state: StudioState, chatKey: string): string | null {
    return state.chatKeyToSession[chatKey] || null
}

/**
 * Resolve a sessionId back to its chatKey, or null if no binding exists.
 */
export function selectChatKeyForSession(state: StudioState, sessionId: string): string | null {
    const indexed = state.sessionToChatKey[sessionId]
    return indexed || null
}

// ── Stream target resolution (replaces resolveSessionTarget) ──

export type SessionStreamTarget =
    | { kind: 'performer'; performerId: string }
    | { kind: 'act-participant'; chatKey: string }

/**
 * Resolve a sessionId to a SessionStreamTarget for event routing.
 * Returns null if no binding exists.
 */
export function selectStreamTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
    const chatKey = selectChatKeyForSession(state, sessionId)
    if (!chatKey) return null

    if (chatKey.startsWith('act:')) {
        return { kind: 'act-participant', chatKey }
    }
    return { kind: 'performer', performerId: chatKey }
}

// ── Messages ──

/**
 * Get messages for a chatKey by resolving through the binding index.
 * Returns unbound draft messages until a session binding exists.
 */
export function selectMessagesForChatKey(state: StudioState, chatKey: string): ChatMessage[] {
    const sessionId = selectSessionIdForChatKey(state, chatKey)
    if (sessionId && state.seMessages[sessionId]) {
        return mergeSystemPrefixMessages(state.chatPrefixes[chatKey], state.seMessages[sessionId])
    }
    return state.chatDrafts[chatKey] || EMPTY_MESSAGES
}

export function selectPrefixCountForChatKey(state: StudioState, chatKey: string): number {
    const prefixes = state.chatPrefixes[chatKey] || EMPTY_MESSAGES
    const sessionId = selectSessionIdForChatKey(state, chatKey)
    if (!sessionId) {
        return (state.chatDrafts[chatKey] || EMPTY_MESSAGES).length
    }

    const serverIds = new Set((state.seMessages[sessionId] || EMPTY_MESSAGES).map((message) => message.id))
    return prefixes.filter((prefix) => prefix.role === 'system' && !serverIds.has(prefix.id)).length
}

/**
 * Get messages directly by sessionId.
 */
export function selectMessagesForSession(state: StudioState, sessionId: string): ChatMessage[] {
    return state.seMessages[sessionId] || EMPTY_MESSAGES
}

// ── Session Status ──

/**
 * Get the live session status.
 */
export function selectSessionStatus(state: StudioState, sessionId: string): SessionStatus {
    return state.seStatuses[sessionId] || IDLE_STATUS
}

/**
 * Check if a session is currently loading (busy).
 */
export function selectSessionIsLoading(state: StudioState, sessionId: string): boolean {
    return !!state.sessionLoading[sessionId]
}

/**
 * Check if a chatKey's session is loading (convenience for UI components
 * that only know the chatKey).
 */
export function selectChatKeyIsLoading(state: StudioState, chatKey: string): boolean {
    const sessionId = selectSessionIdForChatKey(state, chatKey)
    return !!(sessionId && state.sessionLoading[sessionId])
}

// ── Dock state ──

/**
 * Get pending permission for a session.
 */
export function selectPendingPermission(state: StudioState, sessionId: string): PermissionRequest | null {
    return state.sePermissions[sessionId] || null
}

/**
 * Get pending question for a session.
 */
export function selectPendingQuestion(state: StudioState, sessionId: string): QuestionRequest | null {
    return state.seQuestions[sessionId] || null
}

/**
 * Get todos for a session.
 */
export function selectTodos(state: StudioState, sessionId: string): Todo[] {
    return state.seTodos[sessionId] || EMPTY_TODOS
}

export function selectSessionRevert(state: StudioState, sessionId: string) {
    return state.sessionReverts[sessionId] || null
}

export function selectChatSessionState(state: StudioState, chatKey: string) {
    const sessionId = selectSessionIdForChatKey(state, chatKey)
    return {
        chatKey,
        sessionId,
        messages: selectMessagesForChatKey(state, chatKey),
        prefixCount: selectPrefixCountForChatKey(state, chatKey),
        isLoading: selectChatKeyIsLoading(state, chatKey),
        status: sessionId ? selectSessionStatus(state, sessionId) : IDLE_STATUS,
        permission: sessionId ? selectPendingPermission(state, sessionId) : null,
        question: sessionId ? selectPendingQuestion(state, sessionId) : null,
        todos: sessionId ? selectTodos(state, sessionId) : EMPTY_TODOS,
        revert: sessionId ? selectSessionRevert(state, sessionId) : null,
    }
}
