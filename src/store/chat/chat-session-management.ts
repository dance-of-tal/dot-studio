import { api } from '../../api'
import { showToast } from '../../lib/toast'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { hasModelConfig } from '../../lib/performers'
import {
    appendPerformerSystemMessage,
    getPerformerById,
    getPerformerSessionId,
    syncPerformerMessages,
    type ChatGet,
    type ChatSet,
} from './chat-internals'
import { resolveChatRuntimeTarget } from './chat-runtime-target'

export function createChatSessionManagement(set: ChatSet, get: ChatGet) {
    const createFreshSession = async (
        performerId: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
            actId?: string
            executionMode?: 'direct' | 'safe'
            performerName?: string
        },
    ) => {
        const performer = getPerformerById(get, performerId)
        const target = resolveChatRuntimeTarget(get, performerId)
        const name = options?.performerName || target?.name || performer?.name || 'Untitled Performer'
        const runtimeConfig = target?.runtimeConfig || {
            talRef: null,
            danceRefs: [],
            model: null,
            modelVariant: null,
            agentId: 'build',
            mcpServerNames: [],
            danceDeliveryMode: 'auto' as const,
            planMode: false,
        }

        if (!hasModelConfig(runtimeConfig.model)) {
            return {
                sessionId: null,
                runtimeConfig,
            }
        }

        const executionMode = options?.executionMode || target?.executionMode || 'direct'
        const result = await api.chat.createSession(
            performerId,
            name,
            '',
            executionMode,
            options?.actId,
        )
        const sessionId = result.sessionId
        const nextState: Partial<ReturnType<ChatGet>> = {
            sessionMap: { ...get().sessionMap, [performerId]: sessionId },
        }
        if (options?.resetMessages) {
            nextState.chats = {
                ...get().chats,
                [performerId]: options.resetMessages,
            }
            nextState.chatPrefixes = {
                ...get().chatPrefixes,
                [performerId]: options.resetMessages,
            }
        }
        set(() => nextState)

        // Dual-write: register binding in entity store
        get().registerBinding(performerId, sessionId)
        get().upsertSession({ id: sessionId, title: name, createdAt: Date.now(), status: { type: 'idle' } })
        if (options?.resetMessages) {
            get().setSessionMessages(sessionId, options.resetMessages)
        }

        if (target?.executionMode === 'safe') {
            get().forceReconnectRealtimeEvents()
        }

        await get().listSessions()
        return {
            sessionId,
            runtimeConfig,
        }
    }

        const detachPerformerSessionInternal = (performerId: string, notice?: string) => {
            const oldSessionId = get().sessionMap[performerId]
        set((state) => {
            const nextSessionMap = { ...state.sessionMap }
            delete nextSessionMap[performerId]
            const nextChatContent = notice
                ? [
                    ...(state.chats[performerId] || []),
                    {
                        id: `msg-${Date.now()}`,
                        role: 'system' as const,
                        content: notice,
                        timestamp: Date.now(),
                    },
                ]
                : (state.chats[performerId] || [])

            return {
                chats: {
                    ...state.chats,
                    [performerId]: nextChatContent,
                },
                chatPrefixes: {
                    ...state.chatPrefixes,
                    [performerId]: nextChatContent,
                },
                sessionMap: nextSessionMap,
                selectedPerformerSessionId: state.selectedPerformerId === performerId ? null : state.selectedPerformerSessionId,
                performers: state.performers.map((performer) =>
                    performer.id === performerId ? { ...performer, activeSessionId: undefined } : performer,
                ),
            }
        })
        // Dual-write: clean entity store
        if (oldSessionId) {
            get().unregisterBinding(performerId)
            get().clearSessionRevert(oldSessionId)
        }
    }

    return {
        createFreshSession,
        clearSession: (performerId: string) => {
            const sessionId = get().sessionMap[performerId]
            set((state) => {
                const nextChats = { ...state.chats }
                delete nextChats[performerId]
                const nextChatPrefixes = { ...state.chatPrefixes }
                delete nextChatPrefixes[performerId]
                const nextSessionMap = { ...state.sessionMap }
                delete nextSessionMap[performerId]
                return {
                    chats: nextChats,
                    chatPrefixes: nextChatPrefixes,
                    sessionMap: nextSessionMap,
                    selectedPerformerSessionId: state.selectedPerformerId === performerId ? null : state.selectedPerformerSessionId,
                    performers: state.performers.map((performer) =>
                        performer.id === performerId ? { ...performer, activeSessionId: undefined } : performer,
                    ),
                }
            })
            // Dual-write: entity store cleanup
            if (sessionId) {
                get().clearSessionData(sessionId)
                get().unregisterBinding(performerId)
                get().clearSessionRevert(sessionId)
            }
        },

        startNewSession: async (performerId: string) => {
            const target = resolveChatRuntimeTarget(get, performerId)
            if (!target || !hasModelConfig(target.runtimeConfig.model)) {
                get().clearSession(performerId)
                return
            }
            try {
                await createFreshSession(performerId, { resetMessages: [] })
                set({ selectedPerformerSessionId: null })
            } catch (error) {
                console.error('Failed to start new session', error)
                appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
            }
        },

        abortChat: async (performerId: string) => {
            const sessionId = getPerformerSessionId(get, performerId)
            if (sessionId) {
                try {
                    await api.chat.abort(sessionId)
                    await syncPerformerMessages(set, get, performerId, sessionId)
                    appendPerformerSystemMessage(set, get, performerId, 'Stopped the current turn.')
                } catch (error) {
                    console.error('Failed to abort chat', error)
                    appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
                }
            }
            set({ loadingPerformerId: null })
            // Dual-write: entity store
            if (sessionId) {
                get().setSessionLoading(sessionId, false)
            }
        },

        undoLastTurn: async (performerId: string) => {
            const sessionId = getPerformerSessionId(get, performerId)
            if (!sessionId) return
            const lastUser = [...(get().chats[performerId] || [])]
                .reverse()
                .find((message) => message.role === 'user')
            if (!lastUser) {
                appendPerformerSystemMessage(set, get, performerId, 'No prior turn is available to undo.')
                return
            }

            set({ loadingPerformerId: performerId })
            get().setSessionLoading(sessionId, true)
            try {
                const result = await api.chat.revert(sessionId, lastUser.id)
                const revert = readSessionRevert(result)
                if (revert) {
                    get().setSessionRevert(sessionId, revert)
                }
                await syncPerformerMessages(set, get, performerId, sessionId)
            } catch (error) {
                appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
            } finally {
                set({ loadingPerformerId: null })
                get().setSessionLoading(sessionId, false)
            }
        },

        rehydrateSessions: async () => {
            const state = get()
            const sessionEntries = Object.entries(state.sessionMap)
            if (sessionEntries.length === 0) return

            const stalePerformerIds: string[] = []
            for (const [performerId, sessionId] of sessionEntries) {
                try {
                    await syncPerformerMessages(set, get, performerId, sessionId)
                } catch (error) {
                    console.error(`Failed to rehydrate session for performer ${performerId}:`, error)
                    stalePerformerIds.push(performerId)
                }
            }

            if (stalePerformerIds.length > 0) {
                set((state) => {
                    const nextMap = { ...state.sessionMap }
                    for (const id of stalePerformerIds) {
                        delete nextMap[id]
                    }
                    return {
                        sessionMap: nextMap,
                        performers: state.performers.map((performer) =>
                            stalePerformerIds.includes(performer.id) ? { ...performer, activeSessionId: undefined } : performer,
                        ),
                    }
                })
            }
        },

        revertSession: async (performerId: string, messageId: string) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return

            set({ loadingPerformerId: performerId })
            get().setSessionLoading(sessionId, true)
            try {
                const result = await api.chat.revert(sessionId, messageId)
                const revert = readSessionRevert(result)
                if (revert) {
                    get().setSessionRevert(sessionId, revert)
                }
                await syncPerformerMessages(set, get, performerId, sessionId)
            } catch (error) {
                console.error('Failed to revert session', error)
                appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
            } finally {
                set({ loadingPerformerId: null })
                get().setSessionLoading(sessionId, false)
            }
        },

        restoreRevertedMessage: async (performerId: string, messageId: string) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return

            const revert = state.sessionReverts[sessionId]
            if (!revert?.messageId) return

            const messages = state.seMessages[sessionId] || state.chats[performerId] || []
            const nextUserMessage = messages.find((message) => message.role === 'user' && message.id > messageId)

            set({ loadingPerformerId: performerId })
            get().setSessionLoading(sessionId, true)
            try {
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
                await syncPerformerMessages(set, get, performerId, sessionId)
            } catch (error) {
                console.error('Failed to restore reverted message', error)
                appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
            } finally {
                set({ loadingPerformerId: null })
                get().setSessionLoading(sessionId, false)
            }
        },

        getDiff: async (performerId: string) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return []
            try {
                return await api.chat.diff(sessionId)
            } catch (error) {
                console.error('Failed to get diff', error)
                appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
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
                const { sessionMap, chats } = get()
                const nextMap = { ...sessionMap }
                const nextChats = { ...chats }
                const affectedPerformerIds: string[] = []
                for (const [performerId, sid] of Object.entries(nextMap)) {
                    if (sid === sessionId) {
                        delete nextMap[performerId]
                        delete nextChats[performerId]
                        affectedPerformerIds.push(performerId)
                    }
                }
                set((state) => ({
                    sessionMap: nextMap,
                    chats: nextChats,
                    selectedPerformerSessionId: state.selectedPerformerSessionId === sessionId ? null : state.selectedPerformerSessionId,
                    performers: affectedPerformerIds.length > 0
                        ? state.performers.map((performer) =>
                            affectedPerformerIds.includes(performer.id) ? { ...performer, activeSessionId: undefined } : performer,
                        )
                        : state.performers,
                }))
                get().listSessions()
                // Dual-write: entity store cleanup
                for (const performerId of affectedPerformerIds) {
                    get().unregisterBinding(performerId)
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

        detachPerformerSession: detachPerformerSessionInternal,
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
