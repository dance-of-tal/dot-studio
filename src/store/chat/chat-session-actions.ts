import { api } from '../../api'
import { showToast } from '../../lib/toast'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../../lib/performers'
import {
    addChatMessage,
    appendPerformerSystemMessage,
    getPerformerById,
    getPerformerSessionId,
    scheduleSessionFallbackSync,
    syncPerformerMessages,
    type ChatGet,
    type ChatSet,
} from './chat-internals'

function buildActParticipantChatKey(actId: string, threadId: string, participantKey: string) {
    return `act:${actId}:thread:${threadId}:participant:${participantKey}`
}

export function createChatSessionActions(set: ChatSet, get: ChatGet) {
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
        const name = options?.performerName || performer?.name || 'Untitled Performer'
        const runtimeConfig = performer ? resolvePerformerRuntimeConfig(performer) : {
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

        const executionMode = options?.executionMode || (performer?.executionMode === 'safe' ? 'safe' : 'direct')
        const result = await api.chat.createSession(
            performerId,
            name,
            '',
            executionMode,
            options?.actId,
        )
        const sessionId = result.sessionId
        const nextState: Record<string, any> = {
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

        if (performer?.executionMode === 'safe') {
            get().forceReconnectRealtimeEvents()
        }

        await get().listSessions()
        return {
            sessionId,
            runtimeConfig,
        }
    }

    const detachPerformerSessionInternal = (performerId: string, notice?: string) => {
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
    }

    return {
        sendMessage: async (performerId: string, text: string, attachments?: any[], extraDanceRefs = [], mentionedPerformers = []) => {
            let sessionId: string | undefined = get().sessionMap[performerId]
            const performer = getPerformerById(get, performerId)
            const runtimeConfig = performer ? resolvePerformerRuntimeConfig(performer) : {
                talRef: null,
                danceRefs: [],
                model: null,
                modelVariant: null,
                agentId: 'build',
                mcpServerNames: [],
                danceDeliveryMode: 'auto' as const,
                planMode: false,
            }
            if (!hasModelConfig(runtimeConfig.model)) return

            if (!sessionId) {
                try {
                    const freshSession = await createFreshSession(performerId)
                    sessionId = freshSession.sessionId || undefined
                } catch (error) {
                    console.error('Failed to create session', error)
                    appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
                    return
                }
            }

            if (!sessionId) {
                set({ loadingPerformerId: null })
                return
            }

            addChatMessage(set, get, performerId, {
                id: Date.now().toString(),
                role: 'user',
                content: text,
                timestamp: Date.now(),
                metadata: {
                    agentName: runtimeConfig.agentId || 'build',
                    modelId: runtimeConfig.model?.modelId,
                    provider: runtimeConfig.model?.provider,
                    variant: runtimeConfig.modelVariant || undefined,
                },
            })

            set({ loadingPerformerId: performerId })

            try {
                get().initRealtimeEvents()
                await api.chat.send(sessionId, {
                    message: text,
                    performer: {
                        performerId,
                        performerName: performer?.name || 'Untitled Performer',
                        talRef: runtimeConfig.talRef,
                        danceRefs: runtimeConfig.danceRefs,
                        extraDanceRefs,
                        model: runtimeConfig.model,
                        modelVariant: runtimeConfig.modelVariant,
                        agentId: runtimeConfig.agentId,
                        mcpServerNames: runtimeConfig.mcpServerNames,
                        danceDeliveryMode: runtimeConfig.danceDeliveryMode,
                        planMode: runtimeConfig.planMode,
                    },
                    attachments,
                    mentions: mentionedPerformers.map((mention: any) => ({ performerId: mention.performerId })),
                })
                scheduleSessionFallbackSync(set, get, performerId, sessionId, Date.now())
            } catch (error: any) {
                addChatMessage(set, get, performerId, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                })
                set({ loadingPerformerId: null })
            }
        },

        sendActMessage: async (actId: string, threadId: string, participantKey: string, text: string) => {
            const act = get().acts.find((entry) => entry.id === actId)
            if (!act || !threadId) return

            const binding = act.participants[participantKey]
            if (!binding) return

            const chatKey = buildActParticipantChatKey(actId, threadId, participantKey)

            let performer: ReturnType<typeof getPerformerById> = null
            if (binding.performerRef.kind === 'draft') {
                const draftId = binding.performerRef.draftId
                performer = get().performers.find((entry) => (entry.meta?.derivedFrom === draftId) || entry.id === draftId) || null
            } else {
                const urn = binding.performerRef.urn
                performer = get().performers.find((entry) => entry.meta?.derivedFrom === urn) || null
            }

            const runtimeConfig = performer ? resolvePerformerRuntimeConfig(performer) : {
                talRef: null,
                danceRefs: [],
                model: null,
                modelVariant: null,
                agentId: 'build',
                mcpServerNames: [],
                danceDeliveryMode: 'auto' as const,
                planMode: false,
            }
            if (!hasModelConfig(runtimeConfig.model)) return

            let sessionId: string | undefined = get().sessionMap[chatKey]
            if (!sessionId) {
                try {
                    const result = await api.chat.createSession(
                        chatKey,
                        performer?.name || 'Performer',
                        '',
                        'direct',
                        actId,
                    )
                    sessionId = result.sessionId
                    set((state) => ({
                        sessionMap: { ...state.sessionMap, [chatKey]: result.sessionId },
                        actThreads: {
                            ...state.actThreads,
                            [actId]: (state.actThreads[actId] || []).map((thread) =>
                                thread.id !== threadId
                                    ? thread
                                    : {
                                        ...thread,
                                        participantSessions: {
                                            ...thread.participantSessions,
                                            [participantKey]: result.sessionId,
                                        },
                                    },
                            ),
                        },
                    }))
                    await get().listSessions()
                } catch (error) {
                    console.error('Failed to create Act session', error)
                    appendPerformerSystemMessage(set, get, chatKey, formatStudioApiErrorMessage(error))
                    return
                }
            }

            if (!sessionId) {
                set({ loadingPerformerId: null })
                return
            }

            addChatMessage(set, get, chatKey, {
                id: Date.now().toString(),
                role: 'user',
                content: text,
                timestamp: Date.now(),
                metadata: {
                    agentName: runtimeConfig.agentId || 'build',
                    modelId: runtimeConfig.model?.modelId,
                    provider: runtimeConfig.model?.provider,
                    variant: runtimeConfig.modelVariant || undefined,
                },
            })

            set({ loadingPerformerId: chatKey })

            try {
                get().initRealtimeEvents()
                await api.chat.send(sessionId, {
                    message: text,
                    performer: {
                        performerId: chatKey,
                        performerName: performer?.name || 'Performer',
                        talRef: runtimeConfig.talRef,
                        danceRefs: runtimeConfig.danceRefs,
                        model: runtimeConfig.model,
                        modelVariant: runtimeConfig.modelVariant,
                        agentId: runtimeConfig.agentId,
                        mcpServerNames: runtimeConfig.mcpServerNames,
                        danceDeliveryMode: runtimeConfig.danceDeliveryMode,
                        planMode: runtimeConfig.planMode,
                    },
                    actId,
                    actThreadId: threadId,
                })
                scheduleSessionFallbackSync(set, get, chatKey, sessionId, Date.now())
            } catch (error: any) {
                addChatMessage(set, get, chatKey, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                })
                set({ loadingPerformerId: null })
            }
        },

        executeSlashCommand: async (performerId: string, cmd: string) => {
            const state = get()
            const sessionId = getPerformerSessionId(get, performerId)
            if (!sessionId) return

            set({ loadingPerformerId: performerId })
            try {
                if (cmd === '/share') {
                    const shareRes = await api.chat.share(sessionId)
                    state.addChatMessage(performerId, {
                        id: `msg-${Date.now()}`,
                        role: 'assistant',
                        content: `Session shared at: ${shareRes.url}`,
                        timestamp: Date.now(),
                    })
                }
            } catch (error: any) {
                state.addChatMessage(performerId, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                })
            } finally {
                set({ loadingPerformerId: null })
            }
        },

        clearSession: (performerId: string) => set((state) => {
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
        }),

        startNewSession: async (performerId: string) => {
            const performer = getPerformerById(get, performerId)
            if (!performer || !hasModelConfig(performer.model)) {
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
        },

        undoLastTurn: async (performerId: string) => {
            const sessionId = getPerformerSessionId(get, performerId)
            if (!sessionId) return
            const lastUser = [...(get().chats[performerId] || [])]
                .reverse()
                .find((message) => message.role === 'user') as any
            if (!lastUser) {
                appendPerformerSystemMessage(set, get, performerId, 'No prior turn is available to undo.')
                return
            }

            set({ loadingPerformerId: performerId })
            try {
                await api.chat.revert(sessionId, lastUser.info?.id || lastUser.id)
                await syncPerformerMessages(set, get, performerId, sessionId)
                appendPerformerSystemMessage(set, get, performerId, 'Undid the last turn.')
            } catch (error) {
                appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
            } finally {
                set({ loadingPerformerId: null })
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
            try {
                await api.chat.revert(sessionId, messageId)
                await syncPerformerMessages(set, get, performerId, sessionId)
                appendPerformerSystemMessage(set, get, performerId, 'Reverted to the selected message.')
            } catch (error) {
                console.error('Failed to revert session', error)
                appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
            } finally {
                set({ loadingPerformerId: null })
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
