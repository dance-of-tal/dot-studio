import type { StateCreator } from 'zustand'
import type { StudioState, ChatSlice } from './types'
import { api } from '../api'
import { showToast } from '../lib/toast'
import {
    buildPerformerConfigHash,
    hasModelConfig,
    resolvePerformerRuntimeConfig,
} from '../lib/performers'
import { mapSessionMessagesToChatMessages } from '../lib/chat-messages'
import { formatStudioApiErrorMessage } from '../lib/api-errors'
// Act helpers removed — will be reimplemented in Phase 2

export const createChatSlice: StateCreator<
    StudioState,
    [],
    [],
    ChatSlice
> = (set, get) => {
    const getPerformerById = (performerId: string) => (
        get().performers.find((item: any) => item.id === performerId) as any
    )

    const getPerformerSessionId = (performerId: string) => get().sessionMap[performerId]

    const syncPerformerMessages = async (performerId: string, sessionId: string) => {
        const messages = await api.chat.messages(sessionId)
        const mapped = mapSessionMessagesToChatMessages(messages)
        set((state) => ({
            chats: {
                ...state.chats,
                [performerId]: [
                    ...(state.chatPrefixes[performerId] || []),
                    ...mapped,
                ],
            },
        }))
        if (getPerformerById(performerId)?.executionMode === 'safe') {
            void get().refreshSafeOwner('performer', performerId)
        }
        return messages
    }

    const createFreshSession = async (
        performerId: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
        }
    ) => {
        const performer = getPerformerById(performerId)
        const name = performer?.name || 'Untitled Performer'
        const configHash = performer ? buildPerformerConfigHash(performer) : ''
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
                configHash,
                runtimeConfig,
            }
        }

        const res = await api.chat.createSession(
            performerId,
            name,
            configHash,
            performer?.executionMode === 'safe' ? 'safe' : 'direct',
        )
        const sessionId = res.sessionId

        set((state: any) => {
            const nextState: Record<string, unknown> = {
                sessionMap: {
                    ...state.sessionMap,
                    [performerId]: sessionId,
                },
                sessionConfigMap: {
                    ...state.sessionConfigMap,
                    [performerId]: configHash,
                },
            }

            if (options?.resetMessages) {
                nextState.chats = {
                    ...state.chats,
                    [performerId]: options.resetMessages,
                }
                nextState.chatPrefixes = {
                    ...state.chatPrefixes,
                    [performerId]: options.resetMessages,
                }
            }

            return nextState
        })

        await get().listSessions()
        return {
            sessionId,
            configHash,
            runtimeConfig,
        }
    }

    const appendPerformerSystemMessage = (performerId: string, content: string) => {
        set((state) => ({
            chats: {
                ...state.chats,
                [performerId]: [
                    ...(state.chats[performerId] || []),
                    {
                        id: `msg-${Date.now()}`,
                        role: 'system' as const,
                        content,
                        timestamp: Date.now(),
                    },
                ],
            },
        }))
    }

    const detachPerformerSessionInternal = (performerId: string, notice?: string) => {
        set((state) => {
            const nextSessionMap = { ...state.sessionMap }
            delete nextSessionMap[performerId]
            const nextConfigMap = { ...state.sessionConfigMap }
            delete nextConfigMap[performerId]
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
                sessionConfigMap: nextConfigMap,
                selectedPerformerSessionId: state.selectedPerformerId === performerId ? null : state.selectedPerformerSessionId,
            }
        })
    }

    const detachActSessionInternal = (actId: string, notice?: string) => {
        const currentSessionId = get().actSessionMap[actId]
        set((state) => {
            const nextActSessionMap = { ...state.actSessionMap }
            delete nextActSessionMap[actId]
            return {
                actSessionMap: nextActSessionMap,
                actChats: currentSessionId && notice
                    ? {
                        ...state.actChats,
                        [currentSessionId]: [
                            ...(state.actChats[currentSessionId] || []),
                            {
                                id: `act-system-${Date.now()}`,
                                role: 'system' as const,
                                content: notice,
                                timestamp: Date.now(),
                            },
                        ],
                    }
                    : state.actChats,
                selectedActSessionId: state.actSessionMap[actId] === state.selectedActSessionId ? null : state.selectedActSessionId,
                loadingActId: state.loadingActId === actId ? null : state.loadingActId,
                stageDirty: true,
            }
        })
    }

    const scheduleSessionFallbackSync = (
        performerId: string,
        sessionId: string,
        startedAt: number,
        attempt = 0,
    ) => {
        const maxAttempts = 8
        const delay = attempt === 0 ? 2500 : 3000

        globalThis.setTimeout(async () => {
            if (get().loadingPerformerId !== performerId) {
                return
            }

            try {
                const messages = await syncPerformerMessages(performerId, sessionId)
                const mapped = mapSessionMessagesToChatMessages(messages)
                const latestAssistant = [...messages]
                    .reverse()
                    .find((message: any) => (message?.info?.role || message?.role) === 'assistant') as any

                const settled = !!(
                    latestAssistant
                    && (latestAssistant.info?.time?.created || 0) >= (startedAt - 1000)
                    && (
                        latestAssistant.info?.time?.completed
                        || latestAssistant.info?.error
                    )
                )

                set((state) => ({
                    chats: {
                        ...state.chats,
                        [performerId]: mapped,
                    },
                    ...(settled
                        ? { loadingPerformerId: state.loadingPerformerId === performerId ? null : state.loadingPerformerId }
                        : {}),
                }))

                if (!settled && attempt < maxAttempts) {
                    scheduleSessionFallbackSync(performerId, sessionId, startedAt, attempt + 1)
                }
            } catch {
                if (attempt < maxAttempts) {
                    scheduleSessionFallbackSync(performerId, sessionId, startedAt, attempt + 1)
                }
            }
        }, delay)
    }

    return {
        chats: {},
        chatPrefixes: {},
        actChats: {},
        actPerformerChats: {},
        actPerformerBindings: {},
        activeChatPerformerId: null,
        sessionMap: {},
        sessionConfigMap: {},
        actSessionMap: {},
        loadingPerformerId: null,
        loadingActId: null,
        sessions: [],
        actSessions: [],

        setActiveChatPerformer: (performerId) => set({ activeChatPerformerId: performerId }),

        addChatMessage: (performerId, msg) => set((s) => ({
            chats: {
                ...s.chats,
                [performerId]: [...(s.chats[performerId] || []), msg]
            }
        })),

        sendMessage: async (performerId, text, attachments, extraDanceRefs = [], mentions) => {
            const { sessionMap, sessionConfigMap, addChatMessage } = get()
            let sessionId: string | undefined = sessionMap[performerId]
            const performer = getPerformerById(performerId)
            const currentConfigHash = performer ? buildPerformerConfigHash(performer) : ''
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
                return
            }
            const configChanged = !!sessionId && sessionConfigMap[performerId] !== currentConfigHash

            // Ensure session exists
            if (!sessionId) {
                try {
                    const freshSession = await createFreshSession(performerId)
                    sessionId = freshSession.sessionId || undefined
                } catch (err) {
                    console.error("Failed to create session", err)
                    appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
                    return
                }
            } else if (configChanged) {
                set({ loadingPerformerId: performerId })
                try {
                    // Find the last assistant or user message to fork from
                    const msgs = get().chats[performerId] || []
                    const lastValidMessage = [...msgs].reverse().find(
                        msg => msg.role === 'assistant' || msg.role === 'user'
                    )

                    const res = await api.chat.fork(
                        sessionId,
                        lastValidMessage ? ((lastValidMessage as any).info?.id || lastValidMessage.id) : ''
                    )
                    
                    sessionId = res.id || res.sessionId
                    if (sessionId) {
                        set((state: any) => {
                            const newMap = { ...state.sessionMap }
                            newMap[performerId] = sessionId
                            const newConfigMap = { ...state.sessionConfigMap }
                            newConfigMap[performerId] = currentConfigHash
                            return { sessionMap: newMap, sessionConfigMap: newConfigMap }
                        })
                        appendPerformerSystemMessage(
                            performerId,
                            'Performer configuration changed. Started a new OpenCode session branch with the updated Tal, Dances, model, and tools.'
                        )
                        // Refresh list in background
                        get().listSessions().catch(() => {})
                    }
                } catch (err) {
                    console.error("Failed to fork session on config change", err)
                    appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
                    set({ loadingPerformerId: null })
                    return
                }
            }

            if (!sessionId) {
                set({ loadingPerformerId: null })
                return
            }

            // Add user message to UI
            addChatMessage(performerId, { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() })

            set({ loadingPerformerId: performerId })

            try {
                get().initRealtimeEvents()

                // Pass the prompt over proxy
                await api.chat.send(sessionId, {
                    message: text,
                    performer: {
                        performerId,
                        talRef: runtimeConfig.talRef,
                        danceRefs: runtimeConfig.danceRefs,
                        extraDanceRefs,
                        drafts: get().drafts,
                        model: runtimeConfig.model,
                        modelVariant: runtimeConfig.modelVariant,
                        agentId: runtimeConfig.agentId,
                        mcpServerNames: runtimeConfig.mcpServerNames,
                        danceDeliveryMode: runtimeConfig.danceDeliveryMode,
                        planMode: runtimeConfig.planMode,
                        configHash: currentConfigHash,
                    },
                    attachments,
                    mentions: mentions && mentions.length > 0 ? mentions : undefined,
                    relations: get().edges.map(e => ({
                        id: e.id,
                        from: e.from,
                        to: e.to,
                        interaction: e.interaction,
                        description: e.description,
                    })),
                })
                scheduleSessionFallbackSync(performerId, sessionId, Date.now())
            } catch (err: any) {
                addChatMessage(performerId, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(err),
                    timestamp: Date.now(),
                })
                set({ loadingPerformerId: null })
            }
        },

        sendActMessage: async (_actId, _text) => {
            console.warn('[studio] sendActMessage: Act runtime removed (Phase 2 pending)')
        },

        abortAct: async (_actId) => {
            console.warn('[studio] abortAct: Act runtime removed (Phase 2 pending)')
        },

        executeSlashCommand: async (performerId, cmd) => {
            const state = get()
            const sessionId = getPerformerSessionId(performerId)
            if (!sessionId) return

            set({ loadingPerformerId: performerId })
            try {
                if (cmd === '/share') {
                    const shareRes = await api.chat.share(sessionId)
                    state.addChatMessage(performerId, {
                        id: `msg-${Date.now()}`,
                        role: 'assistant',
                        content: `Session shared at: ${shareRes.url}`,
                        timestamp: Date.now()
                    })
                } else if (cmd === '/compact') {
                    await get().summarizeSession(performerId)
                }
            } catch (e: any) {
                state.addChatMessage(performerId, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(e),
                    timestamp: Date.now(),
                })
            } finally {
                set({ loadingPerformerId: null })
            }
        },

        clearSession: (performerId) => set((s) => {
            const newChats = { ...s.chats }
            delete newChats[performerId]
            const newChatPrefixes = { ...s.chatPrefixes }
            delete newChatPrefixes[performerId]
            const newSessionMap = { ...s.sessionMap }
            delete newSessionMap[performerId]
            const newConfigMap = { ...s.sessionConfigMap }
            delete newConfigMap[performerId]
            return {
                chats: newChats,
                chatPrefixes: newChatPrefixes,
                sessionMap: newSessionMap,
                sessionConfigMap: newConfigMap,
                selectedPerformerSessionId: s.selectedPerformerId === performerId ? null : s.selectedPerformerSessionId,
            }
        }),

        startNewSession: async (performerId) => {
            const performer = getPerformerById(performerId)
            if (!performer || !hasModelConfig(performer.model)) {
                get().clearSession(performerId)
                return
            }
            try {
                await createFreshSession(performerId, { resetMessages: [] })
                set({ selectedPerformerSessionId: null })
            } catch (err) {
                console.error('Failed to start new session', err)
                appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
            }
        },

        startNewActSession: (_actId) => {
            console.warn('[studio] startNewActSession: Act runtime removed (Phase 2 pending)')
        },

        detachPerformerSession: (performerId, notice) => {
            detachPerformerSessionInternal(performerId, notice)
        },

        detachActSession: (actId, notice) => {
            detachActSessionInternal(actId, notice)
        },

        abortChat: async (performerId) => {
            const sessionId = getPerformerSessionId(performerId)
            if (sessionId) {
                try {
                    await api.chat.abort(sessionId)
                    await syncPerformerMessages(performerId, sessionId)
                    appendPerformerSystemMessage(performerId, 'Stopped the current turn.')
                } catch (err) {
                    console.error('Failed to abort chat', err)
                    appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
                }
            }
            set({ loadingPerformerId: null })
        },

        summarizeSession: async (performerId) => {
            const sessionId = getPerformerSessionId(performerId)
            const performer = getPerformerById(performerId)
            const runtimeConfig = performer ? resolvePerformerRuntimeConfig(performer) : null

            if (!sessionId || !runtimeConfig?.model || !hasModelConfig(runtimeConfig.model)) {
                appendPerformerSystemMessage(
                    performerId,
                    'Select a model and start a thread before compacting.',
                )
                return
            }

            set({ loadingPerformerId: performerId })
            try {
                await api.chat.summarize(sessionId, {
                    providerID: runtimeConfig.model.provider,
                    modelID: runtimeConfig.model.modelId,
                })
                await syncPerformerMessages(performerId, sessionId)
                appendPerformerSystemMessage(performerId, 'Thread compacted.')
            } catch (e: any) {
                appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(e))
            } finally {
                set({ loadingPerformerId: null })
            }
        },

        undoLastTurn: async (performerId) => {
            const sessionId = getPerformerSessionId(performerId)
            if (!sessionId) {
                return
            }

            let serverMessageId: string | null = null
            let messagesFetchError: unknown = null
            try {
                const messages = await api.chat.messages(sessionId)
                const lastUser = [...messages]
                    .reverse()
                    .find((message: any) => (message?.info?.role || message?.role) === 'user')
                serverMessageId = lastUser?.info?.id || lastUser?.id || null
            } catch (err) {
                messagesFetchError = err
            }

            if (messagesFetchError) {
                const errMessage = formatStudioApiErrorMessage(messagesFetchError)
                if (/\b(not a git repository|git\b.*\bnot found)\b/i.test(errMessage)) {
                    const notice = 'Direct mode undo is available only when the project workspace is a Git repository.'
                    appendPerformerSystemMessage(performerId, notice)
                    showToast(notice, 'error', {
                        title: 'Undo unavailable',
                        dedupeKey: `performer:undo:no-git:${performerId}`,
                    })
                } else {
                    appendPerformerSystemMessage(performerId, errMessage)
                }
                return
            }

            if (!serverMessageId) {
                appendPerformerSystemMessage(performerId, 'No prior turn is available to undo.')
                return
            }

            set({ loadingPerformerId: performerId })
            try {
                await api.chat.revert(sessionId, serverMessageId)
                await syncPerformerMessages(performerId, sessionId)
                appendPerformerSystemMessage(performerId, 'Undid the last turn.')
                const performer = getPerformerById(performerId)
                if (!performer || performer.executionMode !== 'safe') {
                    api.vcs.get().then((vcs) => {
                        if (!vcs?.branch) {
                            appendPerformerSystemMessage(
                                performerId,
                                '⚠️ This project has no Git repository. Chat history was reverted, but file changes may not have been restored.',
                            )
                            showToast(
                                'Chat was reverted, but file changes may not have been restored. Use Safe mode for reliable undo.',
                                'warning',
                                {
                                    title: 'Undo — files may not be restored',
                                    dedupeKey: `performer:undo:partial:${performerId}`,
                                },
                            )
                        }
                    }).catch(() => {})
                }
            } catch (err) {
                const message = formatStudioApiErrorMessage(err)
                if (/\b(not a git repository|git\b.*\bnot found)\b/i.test(message)) {
                    const notice = 'Direct mode undo is available only when the project workspace is a Git repository.'
                    appendPerformerSystemMessage(performerId, notice)
                    showToast(notice, 'error', {
                        title: 'Undo unavailable',
                        dedupeKey: `performer:undo:no-git:${performerId}`,
                    })
                } else {
                    appendPerformerSystemMessage(performerId, message)
                }
            } finally {
                set({ loadingPerformerId: null })
            }
        },

        rehydrateSessions: async () => {
            const state = get()
            const sessionEntries = Object.entries(state.sessionMap)
            if (sessionEntries.length === 0) return

            for (const [performerId, sessionId] of sessionEntries) {
                try {
                    await syncPerformerMessages(performerId, sessionId)
                } catch (err) {
                    console.error(`Failed to rehydrate session for performer ${performerId}:`, err)
                }
            }
        },

        forkSession: async (performerId, messageId) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return

            try {
                const res = await api.chat.fork(sessionId, messageId)
                const newSessionId = res.id || res.sessionId
                if (newSessionId) {
                    set((state: any) => {
                        const newMap = { ...state.sessionMap }
                        newMap[performerId] = newSessionId
                        const newConfigMap = { ...state.sessionConfigMap }
                        const performer = getPerformerById(performerId)
                        newConfigMap[performerId] = performer ? buildPerformerConfigHash(performer) : ''
                        return { sessionMap: newMap, sessionConfigMap: newConfigMap }
                    })
                    // Re-sync messages for the new branch
                    await get().rehydrateSessions()
                    // Refresh list
                    get().listSessions()
                }
            } catch (err) {
                console.error("Failed to fork session", err)
                appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
            }
        },

        revertSession: async (performerId, messageId) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return

            try {
                await api.chat.revert(sessionId, messageId)
                await get().rehydrateSessions()
            } catch (err) {
                console.error("Failed to revert session", err)
                appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
            }
        },

        getDiff: async (performerId) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return []

            try {
                return await api.chat.diff(sessionId)
            } catch (err) {
                console.error("Failed to get diff", err)
                appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
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

        deleteSession: async (sessionId) => {
            try {
                await api.chat.deleteSession(sessionId)
                // Remove from sessionMap if present
                const { sessionMap, sessionConfigMap, chats } = get()
                const newMap = { ...sessionMap }
                const newConfigMap = { ...sessionConfigMap }
                const newChats = { ...chats }
                for (const [performerId, sid] of Object.entries(newMap)) {
                    if (sid === sessionId) {
                        delete newMap[performerId]
                        delete newConfigMap[performerId]
                        delete newChats[performerId]
                    }
                }
                set({
                    sessionMap: newMap,
                    sessionConfigMap: newConfigMap,
                    chats: newChats,
                    selectedPerformerSessionId: get().selectedPerformerSessionId === sessionId ? null : get().selectedPerformerSessionId,
                })
                // Refresh list
                get().listSessions()
            } catch (err) {
                console.error('Failed to delete session', err)
                showToast('Failed to delete session', 'error', {
                    title: 'Thread delete failed',
                    dedupeKey: `thread:delete:${sessionId}`,
                })
            }
        },

        deleteActSession: (_sessionId) => {
            console.warn('[studio] deleteActSession: Act runtime removed (Phase 2 pending)')
        },

        renameActSession: (_sessionId, _title) => {
            console.warn('[studio] renameActSession: Act runtime removed (Phase 2 pending)')
        },
    }
}
