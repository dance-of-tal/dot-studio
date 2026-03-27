/**
 * Session Selectors — Phase 1
 *
 * Derived selectors that read from the normalized session entity store.
 * Each selector resolves chatKey → sessionId then reads the entity table.
 * These replace direct reads from the flat `chats` Record.
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
    return state.chatKeyToSession[chatKey] || state.sessionMap[chatKey] || null
}

/**
 * Resolve a sessionId back to its chatKey, or null if no binding exists.
 */
export function selectChatKeyForSession(state: StudioState, sessionId: string): string | null {
    const indexed = state.sessionToChatKey[sessionId]
    if (indexed) {
        return indexed
    }
    for (const [chatKey, mappedSessionId] of Object.entries(state.sessionMap)) {
        if (mappedSessionId === sessionId) {
            return chatKey
        }
    }
    return null
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
 * Falls back to the legacy `chats` Record if not yet migrated.
 */
export function selectMessagesForChatKey(state: StudioState, chatKey: string): ChatMessage[] {
    const sessionId = selectSessionIdForChatKey(state, chatKey)
    if (sessionId && state.seMessages[sessionId]) {
        return mergeSystemPrefixMessages(state.chatPrefixes[chatKey], state.seMessages[sessionId])
    }
    // Legacy fallback: read from old chats record during migration
    return state.chats[chatKey] || EMPTY_MESSAGES
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
    if (!sessionId) {
        // Legacy fallback
        return state.loadingPerformerId === chatKey
    }
    return !!state.sessionLoading[sessionId]
}

// ── Dock state ──

/**
 * Get pending permission for a session.
 * Checks both new entity store and legacy pendingPermissions.
 */
export function selectPendingPermission(state: StudioState, sessionId: string): PermissionRequest | null {
    return state.sePermissions[sessionId] || state.pendingPermissions[sessionId] || null
}

/**
 * Get pending question for a session.
 */
export function selectPendingQuestion(state: StudioState, sessionId: string): QuestionRequest | null {
    return state.seQuestions[sessionId] || state.pendingQuestions[sessionId] || null
}

/**
 * Get todos for a session.
 */
export function selectTodos(state: StudioState, sessionId: string): Todo[] {
    return state.seTodos[sessionId] || state.todos[sessionId] || EMPTY_TODOS
}

// ── History ──

/**
 * Get cursor for loading older messages.
 */
export function selectHistoryCursor(state: StudioState, sessionId: string): string | null {
    return state.historyCursors[sessionId] ?? null
}

/**
 * Check if more history is available (cursor exists and is not empty).
 */
export function selectHasMoreHistory(state: StudioState, sessionId: string): boolean {
    const cursor = state.historyCursors[sessionId]
    return cursor !== undefined && cursor !== null
}
