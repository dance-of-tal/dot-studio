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
import { api } from '../api'
import { showToast } from '../lib/toast'
import {
    hasModelConfig,
    resolvePerformerRuntimeConfig,
} from '../lib/performers'
import { formatStudioApiErrorMessage } from '../lib/api-errors'

import {
    getPerformerById,
    getPerformerSessionId,
    addChatMessage as addChatMessageHelper,
    appendPerformerSystemMessage,
    syncPerformerMessages,
    scheduleSessionFallbackSync,
} from './chat/chat-internals'
import { createChatApprovals } from './chat/chat-approvals'

export const createChatSlice: StateCreator<
    StudioState,
    [],
    [],
    ChatSlice
> = (set, get) => {
    const buildActParticipantChatKey = (actId: string, threadId: string, participantKey: string) =>
        `act:${actId}:thread:${threadId}:participant:${participantKey}`

    const createFreshSession = async (
        performerId: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
            actId?: string
            executionMode?: 'direct' | 'safe'
            performerName?: string
        }
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
        const res = await api.chat.createSession(
            performerId,
            name,
            '',
            executionMode,
            options?.actId,
        )
        const sessionId = res.sessionId
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
        set(() => {
            return nextState
        })

        // Safe-mode sessions run in a new shadow workspace directory that
        // may not have been subscribed to by the existing SSE stream.
        // Force-reconnect so the server-side EventSource picks up the new dir.
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
                // Clear activeSessionId on the performer so it doesn't
                // get persisted through stage save/load and restored
                // as a stale session.
                performers: state.performers.map((p) =>
                    p.id === performerId ? { ...p, activeSessionId: undefined } : p,
                ),
            }
        })
    }

    // ── Delegated sub-modules ────────────────────────
    const approvals = createChatApprovals(set as any, get)

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

        // ── Performer standalone chat ────────────────
        sendMessage: async (performerId, text, attachments, extraDanceRefs = [], mentionedPerformers = []) => {
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
            if (!hasModelConfig(runtimeConfig.model)) {
                return
            }

            // Ensure session exists (OpenCode tracks agent/model/variant per-message,
            // so config changes don't require a new session)
            if (!sessionId) {
                try {
                    const freshSession = await createFreshSession(performerId)
                    sessionId = freshSession.sessionId || undefined
                } catch (err) {
                    console.error("Failed to create session", err)
                    appendPerformerSystemMessage(set as any, get, performerId, formatStudioApiErrorMessage(err))
                    return
                }
            }

            if (!sessionId) {
                set({ loadingPerformerId: null })
                return
            }

            // Add user message to UI with metadata about the active config
            addChatMessageHelper(set as any, get, performerId, {
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

                // Pass the prompt over proxy
                // Build relatedPerformers from @-mentions
                const relationTargetIds = new Set<string>()
                for (const mention of mentionedPerformers) {
                    relationTargetIds.add(mention.performerId)
                }

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
                    mentions: mentionedPerformers.map((mention) => ({ performerId: mention.performerId })),
                })
                scheduleSessionFallbackSync(set as any, get, performerId, sessionId, Date.now())
            } catch (err: any) {
                addChatMessageHelper(set as any, get, performerId, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(err),
                    timestamp: Date.now(),
                })
                set({ loadingPerformerId: null })
            }
        },

        // ── Act chat (choreography model) ─────────────
        sendActMessage: async (actId, threadId, participantKey, text) => {
            const act = get().acts.find((a) => a.id === actId)
            if (!act || !threadId) return

            const binding = act.performers[participantKey]
            if (!binding) return

            // Thread-scoped session key: separates participant sessions across threads
            const chatKey = buildActParticipantChatKey(actId, threadId, participantKey)

            // Resolve performer config from the ref binding
            // The binding references a standalone performer — look it up
            let performer: ReturnType<typeof getPerformerById> = null
            if (binding.performerRef.kind === 'draft') {
                const draftId = binding.performerRef.draftId
                // Draft performer — find by draftId in performers
                performer = get().performers.find((p) => (p.meta?.derivedFrom === draftId) || p.id === draftId) || null
            } else {
                const urn = binding.performerRef.urn
                // Registry performer — find by URN
                performer = get().performers.find((p) => p.meta?.derivedFrom === urn) || null
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

            // Ensure session exists
            let sessionId: string | undefined = get().sessionMap[chatKey]
            if (!sessionId) {
                try {
                    const res = await api.chat.createSession(
                        chatKey,
                        performer?.name || 'Performer',
                        '',
                        'direct',
                        actId,
                    )
                    sessionId = res.sessionId
                    set((s) => ({
                        sessionMap: { ...s.sessionMap, [chatKey]: res.sessionId },
                        actThreads: {
                            ...s.actThreads,
                            [actId]: (s.actThreads[actId] || []).map((thread) =>
                                thread.id !== threadId
                                    ? thread
                                    : {
                                        ...thread,
                                        participantSessions: {
                                            ...thread.participantSessions,
                                            [participantKey]: res.sessionId,
                                        },
                                    },
                            ),
                        },
                    }))
                    await get().listSessions()
                } catch (err) {
                    console.error('Failed to create Act session', err)
                    appendPerformerSystemMessage(set as any, get, chatKey, formatStudioApiErrorMessage(err))
                    return
                }
            }

            if (!sessionId) {
                set({ loadingPerformerId: null })
                return
            }

            // Add user message to UI
            addChatMessageHelper(set as any, get, chatKey, {
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

                // Choreography model: performer collaboration uses callboard tools
                // No relatedPerformers needed — Act context + tools are injected server-side
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
                scheduleSessionFallbackSync(set as any, get, chatKey, sessionId, Date.now())
            } catch (err: any) {
                addChatMessageHelper(set as any, get, chatKey, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(err),
                    timestamp: Date.now(),
                })
                set({ loadingPerformerId: null })
            }
        },

        // ── Slash commands ──────────────────────────
        executeSlashCommand: async (performerId, cmd) => {
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
                        timestamp: Date.now()
                    })
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

        // ── Session management ──────────────────────
        clearSession: (performerId) => set((s) => {
            const newChats = { ...s.chats }
            delete newChats[performerId]
            const newChatPrefixes = { ...s.chatPrefixes }
            delete newChatPrefixes[performerId]
            const newSessionMap = { ...s.sessionMap }
            delete newSessionMap[performerId]
            return {
                chats: newChats,
                chatPrefixes: newChatPrefixes,
                sessionMap: newSessionMap,
                selectedPerformerSessionId: s.selectedPerformerId === performerId ? null : s.selectedPerformerSessionId,
                performers: s.performers.map((p) =>
                    p.id === performerId ? { ...p, activeSessionId: undefined } : p,
                ),
            }
        }),

        startNewSession: async (performerId) => {
            const performer = getPerformerById(get, performerId)
            if (!performer || !hasModelConfig(performer.model)) {
                get().clearSession(performerId)
                return
            }
            try {
                await createFreshSession(performerId, { resetMessages: [] })
                set({ selectedPerformerSessionId: null })
            } catch (err) {
                console.error('Failed to start new session', err)
                appendPerformerSystemMessage(set as any, get, performerId, formatStudioApiErrorMessage(err))
            }
        },

        abortChat: async (performerId) => {
            const sessionId = getPerformerSessionId(get, performerId)
            if (sessionId) {
                try {
                    await api.chat.abort(sessionId)
                    await syncPerformerMessages(set as any, get, performerId, sessionId)
                    appendPerformerSystemMessage(set as any, get, performerId, 'Stopped the current turn.')
                } catch (err) {
                    console.error('Failed to abort chat', err)
                    appendPerformerSystemMessage(set as any, get, performerId, formatStudioApiErrorMessage(err))
                }
            }
            set({ loadingPerformerId: null })
        },


        undoLastTurn: async (performerId) => {
            const sessionId = getPerformerSessionId(get, performerId)
            if (!sessionId) {
                return
            }
            const lastUser = [...(get().chats[performerId] || [])]
                .reverse()
                .find((message) => message.role === 'user') as any
            if (!lastUser) {
                appendPerformerSystemMessage(set as any, get, performerId, 'No prior turn is available to undo.')
                return
            }

            set({ loadingPerformerId: performerId })
            try {
                await api.chat.revert(sessionId, lastUser.info?.id || lastUser.id)
                await syncPerformerMessages(set as any, get, performerId, sessionId)
                appendPerformerSystemMessage(set as any, get, performerId, 'Undid the last turn.')
            } catch (err) {
                appendPerformerSystemMessage(set as any, get, performerId, formatStudioApiErrorMessage(err))
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
                    await syncPerformerMessages(set as any, get, performerId, sessionId)
                } catch (err) {
                    console.error(`Failed to rehydrate session for performer ${performerId}:`, err)
                    // Session likely no longer exists on the server.
                    // Mark as stale so we clean it up below.
                    stalePerformerIds.push(performerId)
                }
            }

            // Remove stale sessions that couldn't be rehydrated
            if (stalePerformerIds.length > 0) {
                set((s) => {
                    const nextMap = { ...s.sessionMap }
                    for (const id of stalePerformerIds) {
                        delete nextMap[id]
                    }
                    return {
                        sessionMap: nextMap,
                        performers: s.performers.map((p) =>
                            stalePerformerIds.includes(p.id) ? { ...p, activeSessionId: undefined } : p,
                        ),
                    }
                })
            }
        },

        revertSession: async (performerId, messageId) => {
            const state = get()
            const sessionId = state.sessionMap[performerId]
            if (!sessionId) return

            set({ loadingPerformerId: performerId })
            try {
                await api.chat.revert(sessionId, messageId)
                await syncPerformerMessages(set as any, get, performerId, sessionId)
                appendPerformerSystemMessage(set as any, get, performerId, 'Reverted to the selected message.')
            } catch (err) {
                console.error("Failed to revert session", err)
                appendPerformerSystemMessage(set as any, get, performerId, formatStudioApiErrorMessage(err))
            } finally {
                set({ loadingPerformerId: null })
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
                appendPerformerSystemMessage(set as any, get, performerId, formatStudioApiErrorMessage(err))
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
                const { sessionMap, chats } = get()
                const newMap = { ...sessionMap }
                const newChats = { ...chats }
                const affectedPerformerIds: string[] = []
                for (const [performerId, sid] of Object.entries(newMap)) {
                    if (sid === sessionId) {
                        delete newMap[performerId]
                        delete newChats[performerId]
                        affectedPerformerIds.push(performerId)
                    }
                }
                set((state) => ({
                    sessionMap: newMap,
                    chats: newChats,
                    selectedPerformerSessionId: state.selectedPerformerSessionId === sessionId ? null : state.selectedPerformerSessionId,
                    performers: affectedPerformerIds.length > 0
                        ? state.performers.map((p) =>
                            affectedPerformerIds.includes(p.id) ? { ...p, activeSessionId: undefined } : p,
                        )
                        : state.performers,
                }))
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

        detachPerformerSession: detachPerformerSessionInternal,

        // ── Approvals (delegated) ───────────────────
        ...approvals,
    }
}
