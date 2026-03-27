/**
 * Session Entity Types — Phase 1
 *
 * Normalized session data structures keyed by sessionId.
 * Replaces the flat `chats: Record<string, ChatMessage[]>` pattern
 * with entity tables for sessions, messages, and derived docks.
 *
 * Field names are prefixed with `se` (session entity) to avoid
 * collisions with the legacy ChatSlice fields during migration.
 */
import type { ChatMessage } from '../../types'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'

// ── Session Status ──

export type SessionStatusType = 'idle' | 'busy' | 'error' | 'retry'

export interface SessionStatus {
    type: SessionStatusType
    attempt?: number
    message?: string
}

// ── Session Entity ──

export interface SessionEntity {
    id: string
    title?: string
    createdAt?: number
    updatedAt?: number
    parentId?: string | null
    status: SessionStatus
}

// ── Session Entity Store Shape ──

export interface SessionEntityState {
    /** sessionId → SessionEntity metadata */
    seEntities: Record<string, SessionEntity>

    /** sessionId → ChatMessage[] (full message list for that session) */
    seMessages: Record<string, ChatMessage[]>

    /** sessionId → SessionStatus (live streaming status) */
    seStatuses: Record<string, SessionStatus>

    /** sessionId → pending PermissionRequest */
    sePermissions: Record<string, PermissionRequest>

    /** sessionId → pending QuestionRequest */
    seQuestions: Record<string, QuestionRequest>

    /** sessionId → Todo[] */
    seTodos: Record<string, Todo[]>

    /**
     * Bidirectional index: chatKey ↔ sessionId.
     *
     * chatKey is:
     *   - performerId for standalone performers
     *   - `act:{actId}:thread:{threadId}:participant:{key}` for Act participants
     *   - ASSISTANT_PERFORMER_ID for assistant
     */
    chatKeyToSession: Record<string, string>
    sessionToChatKey: Record<string, string>

    /** Per-session loading state (replaces shared loadingPerformerId) */
    sessionLoading: Record<string, boolean>

    /** Per-session history cursor for pagination */
    historyCursors: Record<string, string | null>

    /** OpenCode revert state: hide rolled-back messages until restored or next prompt cleanup */
    sessionReverts: Record<string, { messageId: string; partId?: string }>
}

// ── Session Entity Slice (actions) ──

export interface SessionEntityActions {
    // Entity CRUD
    upsertSession: (session: SessionEntity) => void
    removeSession: (sessionId: string) => void

    // Message management
    setSessionMessages: (sessionId: string, messages: ChatMessage[]) => void
    appendSessionMessage: (sessionId: string, message: ChatMessage) => void
    removeSessionMessage: (sessionId: string, messageId: string) => void
    upsertMessageById: (sessionId: string, messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void

    // Status
    setSessionStatus: (sessionId: string, status: SessionStatus) => void
    setSessionLoading: (sessionId: string, loading: boolean) => void

    // Dock state
    setSessionPermission: (sessionId: string, permission: PermissionRequest) => void
    clearSessionPermission: (sessionId: string) => void
    setSessionQuestion: (sessionId: string, question: QuestionRequest) => void
    clearSessionQuestion: (sessionId: string) => void
    setSessionTodos: (sessionId: string, todos: Todo[]) => void

    // Binding index
    registerBinding: (chatKey: string, sessionId: string) => void
    unregisterBinding: (chatKey: string) => void
    unregisterBindingBySession: (sessionId: string) => void

    // History cursor
    setHistoryCursor: (sessionId: string, cursor: string | null) => void

    // Revert state
    setSessionRevert: (sessionId: string, revert: { messageId: string; partId?: string }) => void
    clearSessionRevert: (sessionId: string) => void

    // Bulk clear
    clearSessionData: (sessionId: string) => void
}

export type SessionSlice = SessionEntityState & SessionEntityActions
