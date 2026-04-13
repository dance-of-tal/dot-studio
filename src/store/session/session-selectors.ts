import type { StudioState } from '../types'
import type { ChatMessage } from '../../types'
import type { SessionStatus } from './types'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'
import { mergeSystemPrefixMessages } from '../../lib/chat-messages'
import { parseActParticipantChatKey } from '../../../shared/chat-targets'
import { canAbortSessionExecution, resolveSessionActivity } from './session-activity'
import { deriveChatSessionState, IDLE_STATUS } from './chat-session-state'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TODOS: Todo[] = []

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
    | {
        kind: 'act-participant'
        chatKey: string
        actId: string
        threadId: string
        participantKey: string
    }

/**
 * Resolve a sessionId to a SessionStreamTarget for event routing.
 * Returns null if no binding exists.
 */
export function selectStreamTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
    const chatKey = selectChatKeyForSession(state, sessionId)
    if (!chatKey) return null

    const actTarget = parseActParticipantChatKey(chatKey)
    if (actTarget) {
        return { kind: 'act-participant', chatKey, ...actTarget }
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
    return resolveSessionActivity({
        loading: !!state.sessionLoading[sessionId],
        status: state.seStatuses[sessionId],
        messages: state.seMessages[sessionId] || EMPTY_MESSAGES,
        permission: state.sePermissions[sessionId] || null,
        question: state.seQuestions[sessionId] || null,
    }).isActive
}

export function selectSessionCanAbort(state: StudioState, sessionId: string): boolean {
    return canAbortSessionExecution({
        loading: !!state.sessionLoading[sessionId],
        status: state.seStatuses[sessionId],
        messages: state.seMessages[sessionId] || EMPTY_MESSAGES,
        permission: state.sePermissions[sessionId] || null,
        question: state.seQuestions[sessionId] || null,
    })
}

export function selectSessionIsMutating(state: StudioState, sessionId: string): boolean {
    return !!state.sessionMutationPending[sessionId]
}

export function selectSessionActivityKind(state: StudioState, sessionId: string) {
    return resolveSessionActivity({
        loading: !!state.sessionLoading[sessionId],
        status: state.seStatuses[sessionId],
        messages: state.seMessages[sessionId] || EMPTY_MESSAGES,
        permission: state.sePermissions[sessionId] || null,
        question: state.seQuestions[sessionId] || null,
    }).kind
}

/**
 * Check if a chatKey's session is loading (convenience for UI components
 * that only know the chatKey).
 */
export function selectChatKeyIsLoading(state: StudioState, chatKey: string): boolean {
    const sessionId = selectSessionIdForChatKey(state, chatKey)
    return !!(sessionId && selectSessionIsLoading(state, sessionId))
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
    return deriveChatSessionState({
        chatKey,
        sessionId,
        draftMessages: state.chatDrafts[chatKey] || EMPTY_MESSAGES,
        prefixMessages: state.chatPrefixes[chatKey] || EMPTY_MESSAGES,
        sessionMessages: sessionId ? state.seMessages[sessionId] || EMPTY_MESSAGES : EMPTY_MESSAGES,
        rawLoading: sessionId ? !!state.sessionLoading[sessionId] : false,
        rawStatus: sessionId ? state.seStatuses[sessionId] || null : null,
        status: sessionId ? state.seStatuses[sessionId] || IDLE_STATUS : IDLE_STATUS,
        permission: sessionId ? state.sePermissions[sessionId] || null : null,
        question: sessionId ? state.seQuestions[sessionId] || null : null,
        todos: sessionId ? state.seTodos[sessionId] || EMPTY_TODOS : EMPTY_TODOS,
        revert: sessionId ? state.sessionReverts[sessionId] || null : null,
        isMutating: sessionId ? !!state.sessionMutationPending[sessionId] : false,
    })
}
