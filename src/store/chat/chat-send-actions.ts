import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../../lib/performers'
import type { AssetRef } from '../../types'
import {
    addChatMessage,
    appendPerformerSystemMessage,
    getPerformerById,
    type ChatGet,
    type ChatSet,
} from './chat-internals'
import { resolveChatRuntimeTarget } from './chat-runtime-target'

function buildActParticipantChatKey(actId: string, threadId: string, participantKey: string) {
    return `act:${actId}:thread:${threadId}:participant:${participantKey}`
}

export function createChatSendActions(
    set: ChatSet,
    get: ChatGet,
    createFreshSession: (
        performerId: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
            actId?: string
            executionMode?: 'direct' | 'safe'
            performerName?: string
        },
    ) => Promise<{ sessionId: string | null; runtimeConfig: ReturnType<typeof resolvePerformerRuntimeConfig> }>,
) {
    return {
        sendMessage: async (
            performerId: string,
            text: string,
            attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
            extraDanceRefs: AssetRef[] = [],
        ) => {
            const removeLegacyMessage = (chatKey: string, messageId: string) => {
                set((state) => ({
                    chats: {
                        ...state.chats,
                        [chatKey]: (state.chats[chatKey] || []).filter((message) => message.id !== messageId),
                    },
                }))
            }

            const rollbackOptimisticMessage = (chatKey: string, messageId: string, sid?: string) => {
                removeLegacyMessage(chatKey, messageId)
                if (sid) {
                    get().removeSessionMessage(sid, messageId)
                    get().setSessionLoading(sid, false)
                }
            }

            const ensureSessionBinding = (chatKey: string, sid: string) => {
                get().registerBinding(chatKey, sid)
                if (!get().seEntities[sid]) {
                    get().upsertSession({ id: sid, status: { type: 'idle' } })
                }
            }

            let sessionId: string | undefined = get().sessionMap[performerId]
            const target = resolveChatRuntimeTarget(get, performerId)
            const performer = getPerformerById(get, performerId)
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
            if (!hasModelConfig(runtimeConfig.model)) return

            // Optimistic UI: show user message + loading state immediately
            const optimisticMsg = {
                id: `temp-${Date.now()}`,
                role: 'user' as const,
                content: text,
                timestamp: Date.now(),
                attachments: attachments && attachments.length > 0
                    ? attachments.map((a) => ({ type: a.type, filename: a.filename, mime: a.mime }))
                    : undefined,
                metadata: {
                    agentName: runtimeConfig.agentId || 'build',
                    modelId: runtimeConfig.model?.modelId,
                    provider: runtimeConfig.model?.provider,
                    variant: runtimeConfig.modelVariant || undefined,
                },
            }
            addChatMessage(set, get, performerId, optimisticMsg)

            // Dual-write: entity store
            const existingSessionId = get().sessionMap[performerId]
            if (existingSessionId) {
                ensureSessionBinding(performerId, existingSessionId)
                get().clearSessionRevert(existingSessionId)
                get().appendSessionMessage(existingSessionId, optimisticMsg)
                get().setSessionLoading(existingSessionId, true)
            }

            set({ loadingPerformerId: performerId })

            // Ensure SSE is connected before session creation so we receive
            // streaming deltas from the very first assistant response.
            get().initRealtimeEvents()

            if (!sessionId) {
                try {
                    const freshSession = await createFreshSession(performerId)
                    sessionId = freshSession.sessionId || undefined
                    // Register binding in entity store
                    if (sessionId) {
                        ensureSessionBinding(performerId, sessionId)
                        get().clearSessionRevert(sessionId)
                        // Write optimistic message to entity store for new session
                        get().appendSessionMessage(sessionId, optimisticMsg)
                        get().setSessionLoading(sessionId, true)
                    }
                } catch (error) {
                    console.error('Failed to create session', error)
                    rollbackOptimisticMessage(performerId, optimisticMsg.id)
                    appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
                    set({ loadingPerformerId: null })
                    return
                }
            }

            if (!sessionId) {
                set({ loadingPerformerId: null })
                return
            }

            try {
                await api.chat.send(sessionId, {
                    message: text,
                    performer: {
                        performerId,
                        performerName: target?.name || performer?.name || 'Untitled Performer',
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
                    assistantContext: target?.assistantContext || null,
                })
                // Settlement detection is now handled by entity store via session.idle SSE events.
            } catch (error) {
                rollbackOptimisticMessage(performerId, optimisticMsg.id, sessionId)
                const errorMsg = {
                    id: `msg-${Date.now()}`,
                    role: 'system' as const,
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                }
                addChatMessage(set, get, performerId, errorMsg)
                // Dual-write: entity store error
                if (sessionId) {
                    get().appendSessionMessage(sessionId, errorMsg)
                    get().setSessionLoading(sessionId, false)
                }
                set({ loadingPerformerId: null })
            }
        },

        sendActMessage: async (actId: string, threadId: string, participantKey: string, text: string) => {
            const removeLegacyMessage = (chatKey: string, messageId: string) => {
                set((state) => ({
                    chats: {
                        ...state.chats,
                        [chatKey]: (state.chats[chatKey] || []).filter((message) => message.id !== messageId),
                    },
                }))
            }

            const rollbackOptimisticMessage = (chatKey: string, messageId: string, sid?: string) => {
                removeLegacyMessage(chatKey, messageId)
                if (sid) {
                    get().removeSessionMessage(sid, messageId)
                    get().setSessionLoading(sid, false)
                }
            }

            const ensureSessionBinding = (chatKey: string, sid: string) => {
                get().registerBinding(chatKey, sid)
                if (!get().seEntities[sid]) {
                    get().upsertSession({ id: sid, status: { type: 'idle' } })
                }
            }

            const act = get().acts.find((entry) => entry.id === actId)
            if (!act || !threadId) return

            const binding = act.participants[participantKey]
            if (!binding) return
            const participantLabel = binding.displayName || participantKey

            const chatKey = buildActParticipantChatKey(actId, threadId, participantKey)

            let performer: ReturnType<typeof getPerformerById> = null
            if (binding.performerRef.kind === 'draft') {
                const draftId = binding.performerRef.draftId
                performer = get().performers.find((entry) =>
                    entry.id === draftId
                    || entry.meta?.derivedFrom === `draft:${draftId}`
                ) || null
            } else {
                const urn = binding.performerRef.urn
                performer = get().performers.find((entry) => entry.meta?.derivedFrom === urn) || null
            }

            if (!performer) {
                const refLabel = binding.performerRef.kind === 'registry'
                    ? binding.performerRef.urn
                    : binding.performerRef.draftId
                appendPerformerSystemMessage(set, get, chatKey,
                    `Cannot resolve performer for participant "${participantLabel}" (ref: ${refLabel}). ` +
                    `No matching local performer node found. Try re-importing the Act or creating a performer manually.`,
                )
                return
            }

            const runtimeConfig = resolvePerformerRuntimeConfig(performer)
            if (!hasModelConfig(runtimeConfig.model)) {
                appendPerformerSystemMessage(set, get, chatKey,
                    `Model not configured for performer "${performer.name}". ` +
                    `Open the performer editor and set up a model before sending messages.`,
                )
                return
            }

            // Optimistic UI: show user message + loading state immediately
            const optimisticActMsg = {
                id: `temp-${Date.now()}`,
                role: 'user' as const,
                content: text,
                timestamp: Date.now(),
                metadata: {
                    agentName: runtimeConfig.agentId || 'build',
                    modelId: runtimeConfig.model?.modelId,
                    provider: runtimeConfig.model?.provider,
                    variant: runtimeConfig.modelVariant || undefined,
                },
            }
            addChatMessage(set, get, chatKey, optimisticActMsg)

            // Dual-write: entity store
            const existingActSessionId = get().sessionMap[chatKey]
            if (existingActSessionId) {
                ensureSessionBinding(chatKey, existingActSessionId)
                get().clearSessionRevert(existingActSessionId)
                get().appendSessionMessage(existingActSessionId, optimisticActMsg)
                get().setSessionLoading(existingActSessionId, true)
            }

            set({ loadingPerformerId: chatKey })

            // Ensure SSE is connected before session creation so we receive
            // streaming deltas from the very first assistant response.
            get().initRealtimeEvents()

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
                    // Register binding in entity store
                    ensureSessionBinding(chatKey, result.sessionId)
                    get().clearSessionRevert(result.sessionId)
                    get().appendSessionMessage(result.sessionId, optimisticActMsg)
                    get().setSessionLoading(result.sessionId, true)
                    await get().listSessions()
                } catch (error) {
                    console.error('Failed to create Act session', error)
                    rollbackOptimisticMessage(chatKey, optimisticActMsg.id)
                    appendPerformerSystemMessage(set, get, chatKey, formatStudioApiErrorMessage(error))
                    set({ loadingPerformerId: null })
                    return
                }
            }

            if (!sessionId) {
                set({ loadingPerformerId: null })
                return
            }

            try {
                // Persist workspace before Act send so wake cascade reads latest performer config
                if (typeof get().saveWorkspace === 'function') {
                    await get().saveWorkspace()
                }
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
                // Settlement detection is now handled by entity store via session.idle SSE events.
            } catch (error) {
                rollbackOptimisticMessage(chatKey, optimisticActMsg.id, sessionId)
                const errorActMsg = {
                    id: `msg-${Date.now()}`,
                    role: 'system' as const,
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                }
                addChatMessage(set, get, chatKey, errorActMsg)
                // Dual-write: entity store error
                if (sessionId) {
                    get().appendSessionMessage(sessionId, errorActMsg)
                    get().setSessionLoading(sessionId, false)
                }
                set({ loadingPerformerId: null })
            }
        },

        executeSlashCommand: async (performerId: string, cmd: string) => {
            const state = get()
            const sessionId = get().sessionMap[performerId]
            if (!sessionId) return

            set({ loadingPerformerId: performerId })
            get().setSessionLoading(sessionId, true)
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
            } catch (error) {
                state.addChatMessage(performerId, {
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                })
            } finally {
                set({ loadingPerformerId: null })
                get().setSessionLoading(sessionId, false)
            }
        },
    }
}
