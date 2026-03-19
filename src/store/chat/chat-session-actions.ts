import type { ChatGet, ChatSet } from './chat-internals'
import { createChatSendActions } from './chat-send-actions'
import { createChatSessionManagement } from './chat-session-management'

export function createChatSessionActions(set: ChatSet, get: ChatGet) {
    const sessionManagement = createChatSessionManagement(set, get)
    const sendActions = createChatSendActions(set, get, sessionManagement.createFreshSession)

    return {
        ...sendActions,
        clearSession: sessionManagement.clearSession,
        startNewSession: sessionManagement.startNewSession,
        abortChat: sessionManagement.abortChat,
        undoLastTurn: sessionManagement.undoLastTurn,
        rehydrateSessions: sessionManagement.rehydrateSessions,
        revertSession: sessionManagement.revertSession,
        getDiff: sessionManagement.getDiff,
        listSessions: sessionManagement.listSessions,
        deleteSession: sessionManagement.deleteSession,
        detachPerformerSession: sessionManagement.detachPerformerSession,
    }
}
