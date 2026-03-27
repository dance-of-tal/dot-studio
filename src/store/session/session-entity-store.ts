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
    chatKeyToSession: {},
    sessionToChatKey: {},
    sessionLoading: {},
    historyCursors: {},
    sessionReverts: {},

    // ── Session CRUD ──

    upsertSession: (session: SessionEntity) => set((state) => ({
        seEntities: { ...state.seEntities, [session.id]: session },
    })),

    removeSession: (sessionId: string) => set((state) => {
        const { [sessionId]: _, ...restEntities } = state.seEntities
        const { [sessionId]: _m, ...restMessages } = state.seMessages
        const { [sessionId]: _s, ...restStatuses } = state.seStatuses
        const { [sessionId]: _p, ...restPermissions } = state.sePermissions
        const { [sessionId]: _q, ...restQuestions } = state.seQuestions
        const { [sessionId]: _t, ...restTodos } = state.seTodos
        const { [sessionId]: _l, ...restLoading } = state.sessionLoading
        const { [sessionId]: _c, ...restCursors } = state.historyCursors

        // Clean up binding index
        const chatKey = state.sessionToChatKey[sessionId]
        const nextChatKeyToSession = { ...state.chatKeyToSession }
        const nextSessionToChatKey = { ...state.sessionToChatKey }
        if (chatKey) {
            delete nextChatKeyToSession[chatKey]
        }
        delete nextSessionToChatKey[sessionId]

        return {
            seEntities: restEntities,
            seMessages: restMessages,
            seStatuses: restStatuses,
            sePermissions: restPermissions,
            seQuestions: restQuestions,
            seTodos: restTodos,
            sessionLoading: restLoading,
            historyCursors: restCursors,
            chatKeyToSession: nextChatKeyToSession,
            sessionToChatKey: nextSessionToChatKey,
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
        const { [sessionId]: _, ...rest } = state.sessionLoading
        return { sessionLoading: rest }
    }),

    // ── Dock state ──

    setSessionPermission: (sessionId: string, permission: PermissionRequest) => set((state) => ({
        sePermissions: { ...state.sePermissions, [sessionId]: permission },
    })),

    clearSessionPermission: (sessionId: string) => set((state) => {
        const { [sessionId]: _, ...rest } = state.sePermissions
        return { sePermissions: rest }
    }),

    setSessionQuestion: (sessionId: string, question: QuestionRequest) => set((state) => ({
        seQuestions: { ...state.seQuestions, [sessionId]: question },
    })),

    clearSessionQuestion: (sessionId: string) => set((state) => {
        const { [sessionId]: _, ...rest } = state.seQuestions
        return { seQuestions: rest }
    }),

    setSessionTodos: (sessionId: string, todos: Todo[]) => set((state) => ({
        seTodos: { ...state.seTodos, [sessionId]: todos },
    })),

    // ── Binding index ──

    registerBinding: (chatKey: string, sessionId: string) => set((state) => ({
        chatKeyToSession: { ...state.chatKeyToSession, [chatKey]: sessionId },
        sessionToChatKey: { ...state.sessionToChatKey, [sessionId]: chatKey },
    })),

    unregisterBinding: (chatKey: string) => set((state) => {
        const sessionId = state.chatKeyToSession[chatKey]
        const nextChatKey = { ...state.chatKeyToSession }
        const nextSession = { ...state.sessionToChatKey }
        delete nextChatKey[chatKey]
        if (sessionId) {
            delete nextSession[sessionId]
        }
        return {
            chatKeyToSession: nextChatKey,
            sessionToChatKey: nextSession,
        }
    }),

    unregisterBindingBySession: (sessionId: string) => set((state) => {
        const chatKey = state.sessionToChatKey[sessionId]
        const nextChatKey = { ...state.chatKeyToSession }
        const nextSession = { ...state.sessionToChatKey }
        delete nextSession[sessionId]
        if (chatKey) {
            delete nextChatKey[chatKey]
        }
        return {
            chatKeyToSession: nextChatKey,
            sessionToChatKey: nextSession,
        }
    }),

    // ── History cursor ──

    setHistoryCursor: (sessionId: string, cursor: string | null) => set((state) => ({
        historyCursors: { ...state.historyCursors, [sessionId]: cursor },
    })),

    setSessionRevert: (sessionId: string, revert: { messageId: string; partId?: string }) => set((state) => ({
        sessionReverts: { ...state.sessionReverts, [sessionId]: revert },
    })),

    clearSessionRevert: (sessionId: string) => set((state) => {
        const { [sessionId]: _, ...rest } = state.sessionReverts
        return { sessionReverts: rest }
    }),

    // ── Bulk clear ──

    clearSessionData: (sessionId: string) => set((state) => {
        const { [sessionId]: _m, ...restMessages } = state.seMessages
        const { [sessionId]: _s, ...restStatuses } = state.seStatuses
        const { [sessionId]: _p, ...restPermissions } = state.sePermissions
        const { [sessionId]: _q, ...restQuestions } = state.seQuestions
        const { [sessionId]: _t, ...restTodos } = state.seTodos
        const { [sessionId]: _l, ...restLoading } = state.sessionLoading
        const { [sessionId]: _c, ...restCursors } = state.historyCursors
        const { [sessionId]: _r, ...restReverts } = state.sessionReverts
        return {
            seMessages: restMessages,
            seStatuses: restStatuses,
            sePermissions: restPermissions,
            seQuestions: restQuestions,
            seTodos: restTodos,
            sessionLoading: restLoading,
            historyCursors: restCursors,
            sessionReverts: restReverts,
        }
    }),
})
