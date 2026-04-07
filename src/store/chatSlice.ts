/**
 * Chat slice — thin composition root.
 *
 * Domain logic is split into:
 *   - chat/chat-internals.ts   — shared helpers (sync, system messages)
 *   - chat/chat-approvals.ts   — permission / question handlers
 *
 * This file owns performer standalone chat, session management, and slash commands.
 */
import type { StateCreator } from 'zustand'
import type { StudioState, ChatSlice } from './types'
import {
    appendChatMessage as appendChatMessageHelper,
} from './chat/chat-internals'
import { createChatApprovals } from './chat/chat-approvals'
import { createChatSessionActions } from './chat/chat-session-actions'

export const createChatSlice: StateCreator<
    StudioState,
    [],
    [],
    ChatSlice
> = (set, get) => {
    const approvals = createChatApprovals(get)
    const sessionActions = createChatSessionActions(set, get)

    return {
        activeChatPerformerId: null,
        sessions: [],

        setActiveChatPerformer: (performerId) => set({ activeChatPerformerId: performerId }),

        addChatMessage: (chatKey, msg) => appendChatMessageHelper(set, get, chatKey, msg),

        // ── Approvals (delegated) ───────────────────
        ...approvals,
        ...sessionActions,
    }
}
