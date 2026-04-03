/**
 * Session Entity Store — Zustand slice (Phase 1)
 *
 * Normalized entity tables with CRUD operations for session data.
 * All state is keyed by sessionId. A bidirectional chatKey ↔ sessionId
 * index allows the 3 UI surfaces (Performer / Act / Assistant) to
 * derive their data without maintaining separate stores.
 *
 * Fields use `se` prefix to avoid collision with ChatSlice during migration.
 */
import type { StateCreator } from 'zustand'
import type { StudioState } from '../types'
import type { SessionSlice, SessionEntity, SessionStatus } from './types'
import type { ChatMessage } from '../../types'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'

export const IDLE_STATUS: SessionStatus = { type: 'idle' }

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
    const next = { ...record }
    delete next[key]
    return next
}

export const createSessionSlice: StateCreator<
    StudioState,
    [],
    [],
    SessionSlice
> = (set) => ({
    // ── Initial state ──
    seEntities: {},
    seMessages: {},
    seStatuses: {},
    sePermissions: {},
    seQuestions: {},
    seTodos: {},
    chatDrafts: {},
    chatPrefixes: {},
    chatKeyToSession: {},
    sessionToChatKey: {},
    sessionLoading: {},
    sessionMutationPending: {},
    sessionReverts: {},

    // ── Session CRUD ──

    upsertSession: (session: SessionEntity) => set((state) => ({
        seEntities: { ...state.seEntities, [session.id]: session },
    })),

    removeSession: (sessionId: string) => set((state) => {
        // Clean up binding index
        const chatKey = state.sessionToChatKey[sessionId]
        const nextChatKeyToSession = chatKey ? withoutKey(state.chatKeyToSession, chatKey) : state.chatKeyToSession
        const nextSessionToChatKey = withoutKey(state.sessionToChatKey, sessionId)

        return {
            seEntities: withoutKey(state.seEntities, sessionId),
            seMessages: withoutKey(state.seMessages, sessionId),
            seStatuses: withoutKey(state.seStatuses, sessionId),
            sePermissions: withoutKey(state.sePermissions, sessionId),
            seQuestions: withoutKey(state.seQuestions, sessionId),
            seTodos: withoutKey(state.seTodos, sessionId),
            sessionLoading: withoutKey(state.sessionLoading, sessionId),
            sessionMutationPending: withoutKey(state.sessionMutationPending, sessionId),
            sessionReverts: withoutKey(state.sessionReverts, sessionId),
            chatKeyToSession: nextChatKeyToSession,
            sessionToChatKey: nextSessionToChatKey,
            ...(chatKey ? {
                chatDrafts: withoutKey(state.chatDrafts, chatKey),
                chatPrefixes: withoutKey(state.chatPrefixes, chatKey),
            } : {}),
        }
    }),

    // ── Message management ──

    setSessionMessages: (sessionId: string, messages: ChatMessage[]) => set((state) => ({
        seMessages: { ...state.seMessages, [sessionId]: messages },
    })),

    appendSessionMessage: (sessionId: string, message: ChatMessage) => set((state) => ({
        seMessages: {
            ...state.seMessages,
            [sessionId]: [...(state.seMessages[sessionId] || []), message],
        },
    })),

    removeSessionMessage: (sessionId: string, messageId: string) => set((state) => ({
        seMessages: {
            ...state.seMessages,
            [sessionId]: (state.seMessages[sessionId] || []).filter((m) => m.id !== messageId),
        },
    })),

    upsertMessageById: (sessionId: string, messageId: string, updater: (msg: ChatMessage) => ChatMessage) => set((state) => {
        const existing = state.seMessages[sessionId] || []
        const idx = existing.findIndex((m) => m.id === messageId)
        if (idx === -1) {
            return state
        }
        const next = [...existing]
        next[idx] = updater(next[idx])
        return {
            seMessages: { ...state.seMessages, [sessionId]: next },
        }
    }),

    // ── Status ──

    setSessionStatus: (sessionId: string, status: SessionStatus) => set((state) => ({
        seStatuses: { ...state.seStatuses, [sessionId]: status },
    })),

    setSessionLoading: (sessionId: string, loading: boolean) => set((state) => {
        if (loading) {
            return { sessionLoading: { ...state.sessionLoading, [sessionId]: true } }
        }
        return { sessionLoading: withoutKey(state.sessionLoading, sessionId) }
    }),

    setSessionMutationPending: (sessionId: string, pending: boolean) => set((state) => {
        if (pending) {
            return { sessionMutationPending: { ...state.sessionMutationPending, [sessionId]: true } }
        }
        return { sessionMutationPending: withoutKey(state.sessionMutationPending, sessionId) }
    }),

    // ── Dock state ──

    setSessionPermission: (sessionId: string, permission: PermissionRequest) => set((state) => ({
        sePermissions: { ...state.sePermissions, [sessionId]: permission },
    })),

    clearSessionPermission: (sessionId: string) => set((state) => ({
        sePermissions: withoutKey(state.sePermissions, sessionId),
    })),

    setSessionQuestion: (sessionId: string, question: QuestionRequest) => set((state) => ({
        seQuestions: { ...state.seQuestions, [sessionId]: question },
    })),

    clearSessionQuestion: (sessionId: string) => set((state) => ({
        seQuestions: withoutKey(state.seQuestions, sessionId),
    })),

    setSessionTodos: (sessionId: string, todos: Todo[]) => set((state) => ({
        seTodos: { ...state.seTodos, [sessionId]: todos },
    })),

    setChatDraftMessages: (chatKey: string, messages: ChatMessage[]) => set((state) => ({
        chatDrafts: { ...state.chatDrafts, [chatKey]: messages },
    })),

    appendChatDraftMessage: (chatKey: string, message: ChatMessage) => set((state) => ({
        chatDrafts: {
            ...state.chatDrafts,
            [chatKey]: [...(state.chatDrafts[chatKey] || []), message],
        },
    })),

    removeChatDraftMessage: (chatKey: string, messageId: string) => set((state) => ({
        chatDrafts: {
            ...state.chatDrafts,
            [chatKey]: (state.chatDrafts[chatKey] || []).filter((message) => message.id !== messageId),
        },
    })),

    clearChatDraftMessages: (chatKey: string) => set((state) => ({
        chatDrafts: withoutKey(state.chatDrafts, chatKey),
    })),

    setChatPrefixMessages: (chatKey: string, messages: ChatMessage[]) => set((state) => ({
        chatPrefixes: { ...state.chatPrefixes, [chatKey]: messages },
    })),

    appendChatPrefixMessage: (chatKey: string, message: ChatMessage) => set((state) => ({
        chatPrefixes: {
            ...state.chatPrefixes,
            [chatKey]: [...(state.chatPrefixes[chatKey] || []), message],
        },
    })),

    clearChatPrefixMessages: (chatKey: string) => set((state) => ({
        chatPrefixes: withoutKey(state.chatPrefixes, chatKey),
    })),

    // ── Binding index ──

    registerBinding: (chatKey: string, sessionId: string) => set((state) => {
        const nextChatKeyToSession = { ...state.chatKeyToSession }
        const nextSessionToChatKey = { ...state.sessionToChatKey }

        const previousSessionId = nextChatKeyToSession[chatKey]
        if (previousSessionId && previousSessionId !== sessionId) {
            delete nextSessionToChatKey[previousSessionId]
        }

        const previousChatKey = nextSessionToChatKey[sessionId]
        if (previousChatKey && previousChatKey !== chatKey) {
            delete nextChatKeyToSession[previousChatKey]
        }

        nextChatKeyToSession[chatKey] = sessionId
        nextSessionToChatKey[sessionId] = chatKey

        return {
            chatKeyToSession: nextChatKeyToSession,
            sessionToChatKey: nextSessionToChatKey,
        }
    }),

    unregisterBinding: (chatKey: string) => set((state) => {
        const sessionId = state.chatKeyToSession[chatKey]
        return {
            chatKeyToSession: withoutKey(state.chatKeyToSession, chatKey),
            sessionToChatKey: sessionId ? withoutKey(state.sessionToChatKey, sessionId) : state.sessionToChatKey,
        }
    }),

    unregisterBindingBySession: (sessionId: string) => set((state) => {
        const chatKey = state.sessionToChatKey[sessionId]
        return {
            chatKeyToSession: chatKey ? withoutKey(state.chatKeyToSession, chatKey) : state.chatKeyToSession,
            sessionToChatKey: withoutKey(state.sessionToChatKey, sessionId),
        }
    }),

    setSessionRevert: (sessionId: string, revert: { messageId: string; partId?: string }) => set((state) => ({
        sessionReverts: { ...state.sessionReverts, [sessionId]: revert },
    })),

    clearSessionRevert: (sessionId: string) => set((state) => ({
        sessionReverts: withoutKey(state.sessionReverts, sessionId),
    })),

    // ── Bulk clear ──

    clearSessionData: (sessionId: string) => set((state) => {
        const chatKey = state.sessionToChatKey[sessionId]
        return {
            seMessages: withoutKey(state.seMessages, sessionId),
            seStatuses: withoutKey(state.seStatuses, sessionId),
            sePermissions: withoutKey(state.sePermissions, sessionId),
            seQuestions: withoutKey(state.seQuestions, sessionId),
            seTodos: withoutKey(state.seTodos, sessionId),
            sessionLoading: withoutKey(state.sessionLoading, sessionId),
            sessionMutationPending: withoutKey(state.sessionMutationPending, sessionId),
            sessionReverts: withoutKey(state.sessionReverts, sessionId),
            ...(chatKey ? {
                chatDrafts: withoutKey(state.chatDrafts, chatKey),
                chatPrefixes: withoutKey(state.chatPrefixes, chatKey),
            } : {}),
        }
    }),
})
