import { describeChatTarget } from '../../../shared/chat-targets'
import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { hasModelConfig } from '../../lib/performers'
import { showToast } from '../../lib/toast'
import {
    getChatSessionId,
    syncChatMessages,
    type ChatGet,
    type ChatSet,
} from './chat-internals'
import type { ChatRuntimeConfig } from './chat-runtime-target'
import { EMPTY_RUNTIME_CONFIG, resolveChatRuntimeTarget } from './chat-runtime-target'
import {
    appendSystemNotice,
    clearChatSessionView,
    createFreshSessionBinding,
    detachChatSession,
    selectMessagesForChatKey,
    syncSessionSnapshot,
} from '../session'
import { preparePendingRuntimeExecution } from '../runtime-execution'

export function createChatSessionManagement(set: ChatSet, get: ChatGet) {
    const runSessionMutation = async <T>(
        sessionId: string,
        action: () => Promise<T>,
    ) => {
        get().setSessionMutationPending(sessionId, true)
        try {
            return await action()
        } finally {
            get().setSessionMutationPending(sessionId, false)
        }
    }

    const createFreshSession = async (
        chatKey: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
            actId?: string
            performerName?: string
            preserveDraftMessages?: boolean
        },
    ): Promise<{ sessionId: string | null; runtimeConfig: ChatRuntimeConfig }> => {
        const target = resolveChatRuntimeTarget(get, chatKey)
        const runtimeConfig = target?.runtimeConfig || EMPTY_RUNTIME_CONFIG
        const name = options?.performerName || target?.name || 'Untitled Performer'

        if (!target || target.notice || !hasModelConfig(runtimeConfig.model)) {
            return {
                sessionId: null,
                runtimeConfig,
            }
        }

        const prepared = await preparePendingRuntimeExecution(get, {
            performerId: target.executionScope.performerId,
            actId: target.executionScope.actId,
            runtimeConfig,
        })
        if (prepared.blocked) {
            return {
                sessionId: null,
                runtimeConfig,
            }
        }

        const sessionId = await createFreshSessionBinding(set, get, describeChatTarget(chatKey), {
            title: name,
            clearDrafts: !options?.preserveDraftMessages,
        })
        get().setChatPrefixMessages(
            chatKey,
            options?.resetMessages?.filter((message) => message.role === 'system') || [],
        )
        if (options?.resetMessages) {
            get().setSessionMessages(sessionId, options.resetMessages)
        }

        await get().listSessions()
        return {
            sessionId,
            runtimeConfig,
        }
    }

    const detachChatSessionInternal = (chatKey: string, notice?: string) => {
        detachChatSession(set, get, chatKey, { notice })
        set((state) => ({
            selectedPerformerSessionId: state.selectedPerformerId === chatKey ? null : state.selectedPerformerSessionId,
        }))
    }

    return {
        createFreshSession,
        clearSession: (chatKey: string) => {
            clearChatSessionView(get, chatKey)
            set((state) => ({
                selectedPerformerSessionId: state.selectedPerformerId === chatKey ? null : state.selectedPerformerSessionId,
            }))
        },

        startNewSession: async (chatKey: string) => {
            const target = resolveChatRuntimeTarget(get, chatKey)
            if (!target || target.notice || !hasModelConfig(target.runtimeConfig.model)) {
                get().clearSession(chatKey)
                return
            }
            try {
                await createFreshSession(chatKey, { resetMessages: [] })
                set({ selectedPerformerSessionId: null })
            } catch (error) {
                console.error('Failed to start new session', error)
                appendSystemNotice(get, chatKey, formatStudioApiErrorMessage(error))
            }
        },

        abortChat: async (chatKey: string) => {
            const sessionId = getChatSessionId(get, chatKey)
            if (sessionId) {
                try {
                    await api.chat.abort(sessionId)
                    await syncChatMessages(set, get, chatKey, sessionId)
                    get().setSessionStatus(sessionId, { type: 'idle' })
                    appendSystemNotice(get, chatKey, 'Stopped the current turn.')
                } catch (error) {
                    console.error('Failed to abort chat', error)
                    appendSystemNotice(get, chatKey, formatStudioApiErrorMessage(error))
                }
            }
            if (sessionId) {
                get().setSessionLoading(sessionId, false)
            }
        },

        undoLastTurn: async (chatKey: string) => {
            const sessionId = getChatSessionId(get, chatKey)
            if (!sessionId) return
            const lastUser = [...selectMessagesForChatKey(get(), chatKey)]
                .reverse()
                .find((message) => message.role === 'user')
            if (!lastUser) {
                appendSystemNotice(get, chatKey, 'No prior turn is available to undo.')
                return
            }

            try {
                await runSessionMutation(sessionId, async () => {
                    const result = await api.chat.revert(sessionId, lastUser.id)
                    const revert = readSessionRevert(result)
                    if (revert) {
                        get().setSessionRevert(sessionId, revert)
                    }
                    await syncChatMessages(set, get, chatKey, sessionId)
                })
            } catch (error) {
                appendSystemNotice(get, chatKey, formatStudioApiErrorMessage(error))
            }
        },

        rehydrateSessions: async () => {
            const sessionEntries = Object.entries(get().chatKeyToSession)
            if (sessionEntries.length === 0) return

            const staleChatKeys: string[] = []
            for (const [chatKey, sessionId] of sessionEntries) {
                try {
                    await syncSessionSnapshot(set, get, chatKey, sessionId)
                } catch (error) {
                    console.error(`Failed to rehydrate session for ${chatKey}:`, error)
                    staleChatKeys.push(chatKey)
                }
            }

            for (const chatKey of staleChatKeys) {
                detachChatSession(set, get, chatKey)
            }
        },

        revertSession: async (chatKey: string, messageId: string) => {
            const state = get()
            const sessionId = state.chatKeyToSession[chatKey]
            if (!sessionId) return

            try {
                await runSessionMutation(sessionId, async () => {
                    const result = await api.chat.revert(sessionId, messageId)
                    const revert = readSessionRevert(result)
                    if (revert) {
                        get().setSessionRevert(sessionId, revert)
                    }
                    await syncChatMessages(set, get, chatKey, sessionId)
                })
            } catch (error) {
                console.error('Failed to revert session', error)
                appendSystemNotice(get, chatKey, formatStudioApiErrorMessage(error))
            }
        },

        restoreRevertedMessage: async (chatKey: string, messageId: string) => {
            const state = get()
            const sessionId = state.chatKeyToSession[chatKey]
            if (!sessionId) return

            const revert = state.sessionReverts[sessionId]
            if (!revert?.messageId) return

            const messages = state.seMessages[sessionId] || selectMessagesForChatKey(state, chatKey)
            const nextUserMessage = messages.find((message) => message.role === 'user' && message.id > messageId)

            try {
                await runSessionMutation(sessionId, async () => {
                    if (state.seStatuses[sessionId]?.type && state.seStatuses[sessionId].type !== 'idle') {
                        await api.chat.abort(sessionId).catch(() => {})
                    }

                    if (!nextUserMessage) {
                        await api.chat.unrevert(sessionId)
                        get().clearSessionRevert(sessionId)
                    } else {
                        const result = await api.chat.revert(sessionId, nextUserMessage.id)
                        const nextRevert = readSessionRevert(result)
                        if (nextRevert) {
                            get().setSessionRevert(sessionId, nextRevert)
                        } else {
                            get().clearSessionRevert(sessionId)
                        }
                    }
                    await syncChatMessages(set, get, chatKey, sessionId)
                })
            } catch (error) {
                console.error('Failed to restore reverted message', error)
                appendSystemNotice(get, chatKey, formatStudioApiErrorMessage(error))
            }
        },

        getDiff: async (chatKey: string) => {
            const state = get()
            const sessionId = state.chatKeyToSession[chatKey]
            if (!sessionId) return []
            try {
                return await api.chat.diff(sessionId)
            } catch (error) {
                console.error('Failed to get diff', error)
                appendSystemNotice(get, chatKey, formatStudioApiErrorMessage(error))
                return []
            }
        },

        listSessions: async () => {
            try {
                const list = await api.chat.list()
                set({ sessions: list || [] })
            } catch {
                set({ sessions: [] })
            }
        },

        deleteSession: async (sessionId: string) => {
            try {
                await api.chat.deleteSession(sessionId)
                const affectedChatKeys: string[] = []
                for (const [chatKey, sid] of Object.entries(get().chatKeyToSession)) {
                    if (sid === sessionId) {
                        affectedChatKeys.push(chatKey)
                    }
                }
                set((state) => ({
                    selectedPerformerSessionId: state.selectedPerformerSessionId === sessionId ? null : state.selectedPerformerSessionId,
                }))
                get().listSessions()
                for (const chatKey of affectedChatKeys) {
                    detachChatSession(set, get, chatKey, { keepVisibleMessages: false })
                }
                get().removeSession(sessionId)
            } catch (error) {
                console.error('Failed to delete session', error)
                showToast('Failed to delete session', 'error', {
                    title: 'Thread delete failed',
                    dedupeKey: `thread:delete:${sessionId}`,
                })
            }
        },

        detachPerformerSession: detachChatSessionInternal,
    }
}

function readSessionRevert(result: unknown): { messageId: string; partId?: string } | null {
    if (!result || typeof result !== 'object') {
        return null
    }
    const revert = (result as { revert?: { messageID?: string; partID?: string } | null }).revert
    if (!revert?.messageID) {
        return null
    }
    return {
        messageId: revert.messageID,
        ...(revert.partID ? { partId: revert.partID } : {}),
    }
}
