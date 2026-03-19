/**
 * Chat slice — thin composition root.
 *
 * Domain logic is split into:
 *   - chat/chat-internals.ts   — shared helpers (sync, fallback poller, system messages)
 *   - chat/chat-approvals.ts   — permission / question / todo handlers
 *
 * This file owns performer standalone chat, session management, and slash commands.
 */
import type { StateCreator } from 'zustand'
import type { StudioState, ChatSlice } from './types'
import {
    addChatMessage as addChatMessageHelper,
} from './chat/chat-internals'
import { createChatApprovals } from './chat/chat-approvals'
import { createChatSessionActions } from './chat/chat-session-actions'

export const createChatSlice: StateCreator<
    StudioState,
    [],
    [],
    ChatSlice
> = (set, get) => {
    const approvals = createChatApprovals(set as any, get)
    const sessionActions = createChatSessionActions(set as any, get)

    return {
        chats: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        sessionMap: {},
        loadingPerformerId: null,
        sessions: [],
        pendingPermissions: {},
        pendingQuestions: {},
        todos: {},

        setActiveChatPerformer: (performerId) => set({ activeChatPerformerId: performerId }),

        addChatMessage: (performerId, msg) => addChatMessageHelper(set as any, get, performerId, msg),

        // ── Approvals (delegated) ───────────────────
        ...approvals,
        ...sessionActions,
    }
}
