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
import type { ActRunState, ActThreadResumeSummary } from '../types'

export const createChatSlice: StateCreator<
    StudioState,
    [],
    [],
    ChatSlice
> = (set, get) => {
    const createFreshSession = async (
        performerId: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
        }
    ) => {
        const performer = get().performers.find((item: any) => item.id === performerId) as any
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

        const res = await api.chat.createSession(performerId, name, configHash)
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

    const createFreshActSession = (
        actId: string,
        actName: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
        },
    ) => {
        const currentCount = get().actSessions.filter((session) => session.actId === actId).length
        const sessionId = `act-session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const nextSession = {
            id: sessionId,
            actId,
            actName,
            title: `Session ${currentCount + 1}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'idle' as const,
            lastRunId: null,
            resumeSummary: null,
        }

        set((state) => ({
            actSessions: [nextSession, ...state.actSessions],
            actSessionMap: {
                ...state.actSessionMap,
                [actId]: sessionId,
            },
            actChats: {
                ...state.actChats,
                [sessionId]: options?.resetMessages || [],
            },
            actPerformerChats: {
                ...state.actPerformerChats,
                [sessionId]: {},
            },
            actPerformerBindings: {
                ...state.actPerformerBindings,
                [sessionId]: [],
            },
            stageDirty: true,
        }))

        return sessionId
    }

    const appendActChatMessage = (
        sessionId: string,
        message: { id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number },
    ) => {
        set((state) => ({
            actChats: {
                ...state.actChats,
                [sessionId]: [...(state.actChats[sessionId] || []), message],
            },
            stageDirty: true,
        }))
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
                const messages = await api.chat.messages(sessionId)
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

    const updateActSessionMeta = (
        sessionId: string,
        patch: Partial<{
            updatedAt: number
            status: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'
            lastRunId: string | null
            resumeSummary: ActThreadResumeSummary | null
        }>,
    ) => {
        set((state) => ({
            actSessions: state.actSessions.map((session) => (
                session.id === sessionId
                    ? { ...session, ...patch }
                    : session
            )),
            stageDirty: true,
        }))
    }

    const buildActResumeSummary = (run: ActRunState): ActThreadResumeSummary => ({
        updatedAt: Date.now(),
        runId: run.runId || null,
        currentNodeId: run.currentNodeId,
        finalOutput: run.finalOutput,
        error: run.error,
        iterations: run.iterations,
        nodeOutputs: run.sharedState?.nodeOutputs && typeof run.sharedState.nodeOutputs === 'object'
            ? Object.fromEntries(
                Object.entries(run.sharedState.nodeOutputs as Record<string, unknown>)
                    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
            )
            : {},
        history: Array.isArray(run.history) ? run.history.slice(-24) : [],
        sessionHandles: Array.isArray(run.sessionHandles)
            ? run.sessionHandles.map((session) => ({
                handle: session.handle,
                nodeId: session.nodeId,
                nodeType: session.nodeType,
                performerId: session.performerId,
                status: session.status,
                turnCount: session.turnCount,
                lastUsedAt: session.lastUsedAt,
                summary: session.summary,
            }))
            : [],
    })

    return {
        chats: {},
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

        sendMessage: async (performerId, text, attachments, extraDanceRefs = []) => {
            const { sessionMap, sessionConfigMap, addChatMessage } = get()
            let sessionId: string | undefined = sessionMap[performerId]
            const performer = get().performers.find((a: any) => a.id === performerId) as any
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
            if (!sessionId || configChanged) {
                try {
                    const freshSession = await createFreshSession(performerId, configChanged ? {
                        resetMessages: [{
                            id: `system-${Date.now()}`,
                            role: 'system',
                            content: 'Performer configuration changed. Started a new OpenCode session with the updated Tal, Dances, model, and tools.',
                            timestamp: Date.now(),
                        }],
                    } : undefined)
                    sessionId = freshSession.sessionId || undefined
                } catch (err) {
                    console.error("Failed to create session", err)
                    appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
                    return
                }
            }

            if (!sessionId) {
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

        sendActMessage: async (actId, text) => {
            const state = get()
            const act = state.acts.find((item: any) => item.id === actId) as any
            if (!act) {
                return
            }

            const selectedSession = state.selectedActSessionId
                ? state.actSessions.find((session) => session.id === state.selectedActSessionId && session.actId === actId) || null
                : null
            let sessionId = selectedSession?.id || state.actSessionMap[actId]
            if (!sessionId) {
                sessionId = createFreshActSession(actId, act.name, { resetMessages: [] })
                get().initRealtimeEvents()
            }
            if (state.actSessionMap[actId] !== sessionId || state.selectedActSessionId !== sessionId) {
                set((current) => ({
                    actSessionMap: {
                        ...current.actSessionMap,
                        [actId]: sessionId,
                    },
                    selectedActSessionId: sessionId,
                    stageDirty: true,
                }))
            }

            const currentSession = get().actSessions.find((session) => session.id === sessionId) || null

            const userMessage = {
                id: `act-user-${Date.now()}`,
                role: 'user' as const,
                content: text,
                timestamp: Date.now(),
            }
            appendActChatMessage(sessionId, userMessage)
            updateActSessionMeta(sessionId, {
                status: 'running',
                updatedAt: Date.now(),
            })
            set({ loadingActId: actId })

            try {
                const run = await api.act.run({
                    actSessionId: sessionId,
                    stageAct: act,
                    performers: get().performers.map((performer) => ({
                        ...performer,
                        mcpServerNames: resolvePerformerRuntimeConfig(performer).mcpServerNames,
                    })),
                    drafts: get().drafts,
                    input: text,
                    maxIterations: act.maxIterations,
                    resumeSummary: currentSession?.resumeSummary || undefined,
                })
                if (run.status !== 'interrupted') {
                    const assistantContent = String(run.finalOutput || run.error || (run.status === 'completed' ? 'Act completed.' : 'Act failed.')).trim()
                    appendActChatMessage(sessionId, {
                        id: `act-assistant-${Date.now()}`,
                        role: 'assistant',
                        content: assistantContent,
                        timestamp: Date.now(),
                    })
                }
                updateActSessionMeta(sessionId, {
                    status: run.status,
                    updatedAt: Date.now(),
                    lastRunId: run.runId || null,
                    resumeSummary: buildActResumeSummary(run),
                })
            } catch (error) {
                appendActChatMessage(sessionId, {
                    id: `act-system-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                })
                updateActSessionMeta(sessionId, {
                    status: 'failed',
                    updatedAt: Date.now(),
                })
            } finally {
                set({ loadingActId: null })
            }
        },

        abortAct: async (actId) => {
            const state = get()
            const sessionId = state.actSessionMap[actId]
            if (!sessionId) {
                return
            }

            try {
                await api.act.abort(sessionId)
            } catch (err) {
                console.error('Failed to abort act run', err)
            }

            updateActSessionMeta(sessionId, {
                status: 'interrupted',
                updatedAt: Date.now(),
            })
            appendActChatMessage(sessionId, {
                id: `act-system-${Date.now()}`,
                role: 'system',
                content: 'Act run stopped.',
                timestamp: Date.now(),
            })
            set((current) => ({
                loadingActId: current.loadingActId === actId ? null : current.loadingActId,
            }))
        },

        executeSlashCommand: async (performerId, cmd) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return

            set({ loadingPerformerId: performerId })
            try {
                if (cmd === '/undo') {
                    const msgs = await api.chat.messages(sessionId)
                    const lastUser = [...msgs].reverse().find((m: any) => (m.info?.role || m.role) === 'user')
                    if (lastUser) {
                        await api.chat.revert(sessionId, lastUser.info?.id || lastUser.id)
                    }
                } else if (cmd === '/redo') {
                    await api.chat.unrevert(sessionId)
                } else if (cmd === '/share') {
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

                // Re-sync messages for undo/redo
                if (cmd === '/undo' || cmd === '/redo') {
                    const newMsgs = await api.chat.messages(sessionId)
                    set((s) => ({
                        chats: {
                            ...s.chats,
                            [performerId]: mapSessionMessagesToChatMessages(newMsgs),
                        }
                    }))
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
            const newSessionMap = { ...s.sessionMap }
            delete newSessionMap[performerId]
            const newConfigMap = { ...s.sessionConfigMap }
            delete newConfigMap[performerId]
            return {
                chats: newChats,
                sessionMap: newSessionMap,
                sessionConfigMap: newConfigMap,
                selectedPerformerSessionId: s.selectedPerformerId === performerId ? null : s.selectedPerformerSessionId,
            }
        }),

        startNewSession: async (performerId) => {
            const performer = get().performers.find((item: any) => item.id === performerId) as any
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

        startNewActSession: (actId) => {
            const act = get().acts.find((item: any) => item.id === actId) as any
            if (!act) {
                return
            }
            createFreshActSession(actId, act.name, { resetMessages: [] })
            set({ selectedActSessionId: null })
            get().initRealtimeEvents()
        },

        abortChat: async (performerId) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (sessionId) {
                try {
                    await api.chat.abort(sessionId)
                    const newMsgs = await api.chat.messages(sessionId)
                    set((current) => ({
                        chats: {
                            ...current.chats,
                            [performerId]: mapSessionMessagesToChatMessages(newMsgs),
                        },
                    }))
                    appendPerformerSystemMessage(performerId, 'Stopped the current turn.')
                } catch (err) {
                    console.error('Failed to abort chat', err)
                    appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(err))
                }
            }
            set({ loadingPerformerId: null })
        },

        summarizeSession: async (performerId) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            const performer = state.performers.find((item: any) => item.id === performerId) as any
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
                const newMsgs = await api.chat.messages(sessionId)
                set((s) => ({
                    chats: {
                        ...s.chats,
                        [performerId]: mapSessionMessagesToChatMessages(newMsgs),
                    }
                }))
                appendPerformerSystemMessage(performerId, 'Thread compacted.')
            } catch (e: any) {
                appendPerformerSystemMessage(performerId, formatStudioApiErrorMessage(e))
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
                    const msgs = await api.chat.messages(sessionId)
                    set((s) => ({
                        chats: {
                            ...s.chats,
                            [performerId]: mapSessionMessagesToChatMessages(msgs),
                        }
                    }))
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
                        const performer = get().performers.find((a: any) => a.id === performerId) as any
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

        deleteActSession: (sessionId) => {
            const current = get()
            const nextChats = { ...current.actChats }
            delete nextChats[sessionId]
            const nextPerformerChats = { ...current.actPerformerChats }
            delete nextPerformerChats[sessionId]
            const nextPerformerBindings = { ...current.actPerformerBindings }
            delete nextPerformerBindings[sessionId]

            const nextActSessions = current.actSessions.filter((session) => session.id !== sessionId)
            const nextActSessionMap = { ...current.actSessionMap }
            for (const [actId, mappedSessionId] of Object.entries(nextActSessionMap)) {
                if (mappedSessionId === sessionId) {
                    delete nextActSessionMap[actId]
                }
            }

            set({
                actChats: nextChats,
                actPerformerChats: nextPerformerChats,
                actPerformerBindings: nextPerformerBindings,
                actSessions: nextActSessions,
                actSessionMap: nextActSessionMap,
                selectedActSessionId: current.selectedActSessionId === sessionId ? null : current.selectedActSessionId,
                stageDirty: true,
            })
        },

        renameActSession: (sessionId, title) => set((state) => ({
            actSessions: state.actSessions.map((session) => (
                session.id === sessionId
                    ? {
                        ...session,
                        title: title.trim() || session.title,
                        updatedAt: Date.now(),
                    }
                    : session
            )),
            stageDirty: true,
        })),
    }
}
