import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../../lib/performers'
import type { AssetRef } from '../../types'
import {
    addChatMessage,
    appendPerformerSystemMessage,
    getPerformerById,
    scheduleSessionFallbackSync,
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
            mentionedPerformers: Array<{ performerId: string; name: string }> = [],
        ) => {
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
                    mentions: mentionedPerformers.map((mention) => ({ performerId: mention.performerId })),
                    assistantContext: target?.assistantContext || null,
                })
                scheduleSessionFallbackSync(set, get, performerId, sessionId, Date.now())
            } catch (error) {
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
            } catch (error) {
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
            const sessionId = get().sessionMap[performerId]
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
            } catch (error) {
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
    }
}
