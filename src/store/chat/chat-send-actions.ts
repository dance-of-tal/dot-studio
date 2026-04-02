import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { logChatDebug, summarizeMessagesForChatDebug } from '../../lib/chat-debug'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../../lib/performers'
import type { AssetRef, ChatMessage } from '../../types'
import { buildActParticipantChatKey, describeChatTarget } from '../../../shared/chat-targets'
import {
    addChatMessage,
    appendPerformerSystemMessage,
    getPerformerById,
    syncPerformerMessages,
    type ChatGet,
    type ChatSet,
} from './chat-internals'
import { resolveChatRuntimeTarget } from './chat-runtime-target'
import {
    ensureSession,
    moveDraftMessageToSession,
    registerSessionBinding,
    resolveChatKeySession,
} from '../session'
import { collectRuntimeDraftIds, preparePendingRuntimeExecution } from '../runtime-execution'

const STREAM_RECOVERY_GRACE_MS = 1200
const STREAM_RECOVERY_POLL_MS = 1000
const STREAM_RECOVERY_MAX_POLLS = 45

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildSnapshotSignature(messages: ChatMessage[]) {
    return messages
        .map((message) => `${message.id}:${message.role}:${message.timestamp}:${message.content.length}`)
        .join('|')
}

function hasSettledAssistantReply(messages: ChatMessage[]) {
    let latestUserIndex = -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'user') {
            latestUserIndex = index
            break
        }
    }

    const tail = latestUserIndex >= 0 ? messages.slice(latestUserIndex + 1) : messages
    return tail.some((message) => (
        (message.role === 'assistant' || message.role === 'system')
        && !message.id.startsWith('temp-')
        && message.content.trim().length > 0
    ))
}

export function createChatSendActions(
    set: ChatSet,
    get: ChatGet,
    createFreshSession: (
        performerId: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
            actId?: string
            performerName?: string
            preserveDraftMessages?: boolean
        },
    ) => Promise<{ sessionId: string | null; runtimeConfig: ReturnType<typeof resolvePerformerRuntimeConfig> }>,
) {
    const activeRecoveryPolls = new Map<string, symbol>()

    const scheduleStreamingRecoverySync = (chatKey: string, sessionId: string) => {
        const recoveryToken = Symbol(sessionId)
        activeRecoveryPolls.set(sessionId, recoveryToken)

        void (async () => {
            try {
                await sleep(STREAM_RECOVERY_GRACE_MS)
                if (activeRecoveryPolls.get(sessionId) !== recoveryToken) {
                    return
                }

                let lastSnapshotSignature: string | null = null
                let stableSnapshotPolls = 0
                logChatDebug('fallback', 'start recovery polling', { chatKey, sessionId })

                for (let attempt = 0; attempt < STREAM_RECOVERY_MAX_POLLS; attempt++) {
                    if (activeRecoveryPolls.get(sessionId) !== recoveryToken) {
                        return
                    }

                    const state = get()
                    if (state.chatKeyToSession[chatKey] !== sessionId) {
                        logChatDebug('fallback', 'stop recovery polling: binding changed', { chatKey, sessionId, attempt })
                        return
                    }
                    const localStatus = state.seStatuses[sessionId]?.type || null
                    if (localStatus === 'idle' || localStatus === 'error') {
                        get().setSessionLoading(sessionId, false)
                        logChatDebug('fallback', 'stop recovery polling: local status settled', {
                            chatKey,
                            sessionId,
                            attempt,
                            status: localStatus,
                        })
                        return
                    }
                    if (!state.sessionLoading[sessionId]) {
                        logChatDebug('fallback', 'stop recovery polling: session not loading', { chatKey, sessionId, attempt })
                        return
                    }

                    try {
                        const { status } = await api.chat.status(sessionId)
                        const snapshot = await syncPerformerMessages(set, get, chatKey, sessionId).catch(() => null)
                        if (get().chatKeyToSession[chatKey] !== sessionId) {
                            return
                        }

                        if (snapshot) {
                            const snapshotSignature = buildSnapshotSignature(snapshot.messages)
                            stableSnapshotPolls = snapshotSignature === lastSnapshotSignature
                                ? stableSnapshotPolls + 1
                                : 0
                            lastSnapshotSignature = snapshotSignature
                            logChatDebug('fallback', 'polled session snapshot', {
                                chatKey,
                                sessionId,
                                attempt,
                                status: status?.type || null,
                                stableSnapshotPolls,
                                messages: summarizeMessagesForChatDebug(snapshot.messages),
                            })
                        }

                        if (status?.type === 'busy' || status?.type === 'retry' || status?.type === 'idle' || status?.type === 'error') {
                            get().setSessionStatus(sessionId, status)
                            if (status.type === 'idle' || status.type === 'error') {
                                get().setSessionLoading(sessionId, false)
                                logChatDebug('fallback', 'stop recovery polling: status settled', {
                                    chatKey,
                                    sessionId,
                                    attempt,
                                    status: status.type,
                                })
                                return
                            }
                        }

                        if (
                            snapshot
                            && !status
                            && stableSnapshotPolls >= 1
                            && hasSettledAssistantReply(snapshot.messages)
                        ) {
                            get().setSessionLoading(sessionId, false)
                            logChatDebug('fallback', 'stop recovery polling: snapshot heuristic settled', {
                                chatKey,
                                sessionId,
                                attempt,
                                messages: summarizeMessagesForChatDebug(snapshot.messages),
                            })
                            return
                        }
                    } catch (error) {
                        logChatDebug('fallback', 'poll iteration failed', {
                            chatKey,
                            sessionId,
                            attempt,
                            error: error instanceof Error ? error.message : String(error),
                        })
                        // Ignore fallback polling errors and keep waiting for SSE.
                    }

                    await sleep(STREAM_RECOVERY_POLL_MS)
                }
                logChatDebug('fallback', 'recovery polling exhausted', { chatKey, sessionId })
            } finally {
                if (activeRecoveryPolls.get(sessionId) === recoveryToken) {
                    activeRecoveryPolls.delete(sessionId)
                }
            }
        })()
    }

    return {
        sendMessage: async (
            performerId: string,
            text: string,
            attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
            extraDanceRefs: AssetRef[] = [],
        ) => {
            const rollbackOptimisticMessage = (chatKey: string, messageId: string, sid?: string) => {
                get().removeChatDraftMessage(chatKey, messageId)
                if (sid) {
                    get().removeSessionMessage(sid, messageId)
                    get().setSessionLoading(sid, false)
                }
            }

            let sessionId: string | undefined = resolveChatKeySession(get, performerId) || undefined
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
            logChatDebug('send', 'sendMessage start', {
                chatKey: performerId,
                existingSessionId: sessionId || null,
                textLength: text.length,
                attachmentCount: attachments?.length || 0,
            })

            const prepared = await preparePendingRuntimeExecution(get, {
                performerId,
                runtimeConfig,
            })
            if (prepared.blocked) {
                appendPerformerSystemMessage(
                    set,
                    get,
                    performerId,
                    prepared.reason === 'projection_update_pending'
                        ? 'New chats are blocked until the current run finishes and Studio reapplies the latest projection changes.'
                        : 'New chats are blocked until the current run finishes and Studio reapplies the latest runtime changes.',
                )
                return
            }

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
            const existingSessionId = resolveChatKeySession(get, performerId) || undefined
            if (existingSessionId) {
                registerSessionBinding(set, get, performerId, existingSessionId)
                get().clearSessionRevert(existingSessionId)
                get().setSessionLoading(existingSessionId, true)
            }

            // Ensure SSE is connected before session creation so we receive
            // streaming deltas from the very first assistant response.
            get().initRealtimeEvents()

            if (!sessionId) {
                try {
                    const freshSession = await createFreshSession(performerId, { preserveDraftMessages: true })
                    sessionId = freshSession.sessionId || undefined
                    if (sessionId) {
                        logChatDebug('send', 'created fresh performer session', { chatKey: performerId, sessionId })
                        registerSessionBinding(set, get, performerId, sessionId)
                        get().clearSessionRevert(sessionId)
                        moveDraftMessageToSession(set, get, performerId, sessionId, optimisticMsg.id)
                        get().setSessionLoading(sessionId, true)
                    }
                } catch (error) {
                    console.error('Failed to create session', error)
                    rollbackOptimisticMessage(performerId, optimisticMsg.id)
                    appendPerformerSystemMessage(set, get, performerId, formatStudioApiErrorMessage(error))
                    return
                }
            }

            if (!sessionId) {
                return
            }

            try {
                logChatDebug('send', 'dispatch performer prompt', { chatKey: performerId, sessionId })
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
                if (prepared.requiresDispose) {
                    get().clearProjectionDirty({
                        performerIds: [performerId],
                        draftIds: collectRuntimeDraftIds(runtimeConfig),
                        workspaceWide: true,
                    })
                }
                // Recover from missed streaming events by polling session snapshots
                // until the turn settles.
                scheduleStreamingRecoverySync(performerId, sessionId)
            } catch (error) {
                logChatDebug('send', 'performer prompt failed', {
                    chatKey: performerId,
                    sessionId,
                    error: error instanceof Error ? error.message : String(error),
                })
                rollbackOptimisticMessage(performerId, optimisticMsg.id, sessionId)
                const errorMsg = {
                    id: `msg-${Date.now()}`,
                    role: 'system' as const,
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                }
                addChatMessage(set, get, performerId, errorMsg)
                if (sessionId) {
                    get().setSessionLoading(sessionId, false)
                }
            }
        },

        sendActMessage: async (actId: string, threadId: string, participantKey: string, text: string) => {
            const rollbackOptimisticMessage = (chatKey: string, messageId: string, sid?: string) => {
                get().removeChatDraftMessage(chatKey, messageId)
                if (sid) {
                    get().removeSessionMessage(sid, messageId)
                    get().setSessionLoading(sid, false)
                }
            }

            const act = get().acts.find((entry) => entry.id === actId)
            if (!act || !threadId) return

            const binding = act.participants[participantKey]
            if (!binding) return
            const participantLabel = binding.displayName || participantKey

            const chatKey = buildActParticipantChatKey(actId, threadId, participantKey)
            logChatDebug('send', 'sendActMessage start', {
                chatKey,
                actId,
                threadId,
                participantKey,
                textLength: text.length,
            })

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

            const prepared = await preparePendingRuntimeExecution(get, {
                performerId: performer.id,
                actId,
                runtimeConfig,
            })
            if (prepared.blocked) {
                appendPerformerSystemMessage(
                    set,
                    get,
                    chatKey,
                    prepared.reason === 'projection_update_pending'
                        ? 'New chats are blocked until the current run finishes and Studio reapplies the latest projection changes.'
                        : 'New chats are blocked until the current run finishes and Studio reapplies the latest runtime changes.',
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

            const existingActSessionId = resolveChatKeySession(get, chatKey) || undefined
            if (existingActSessionId) {
                registerSessionBinding(set, get, chatKey, existingActSessionId)
                get().clearSessionRevert(existingActSessionId)
                get().setSessionLoading(existingActSessionId, true)
            }

            // Ensure SSE is connected before session creation so we receive
            // streaming deltas from the very first assistant response.
            get().initRealtimeEvents()

            let sessionId: string | undefined = resolveChatKeySession(get, chatKey) || undefined
            if (!sessionId) {
                try {
                    sessionId = await ensureSession(set, get, describeChatTarget(chatKey), {
                        title: performer?.name || 'Performer',
                        clearDrafts: false,
                    })
                    logChatDebug('send', 'created fresh act session', { chatKey, sessionId })
                    get().clearSessionRevert(sessionId)
                    moveDraftMessageToSession(set, get, chatKey, sessionId, optimisticActMsg.id)
                    get().setSessionLoading(sessionId, true)
                    await get().listSessions()
                } catch (error) {
                    console.error('Failed to create Act session', error)
                    rollbackOptimisticMessage(chatKey, optimisticActMsg.id)
                    appendPerformerSystemMessage(set, get, chatKey, formatStudioApiErrorMessage(error))
                    return
                }
            }

            if (!sessionId) {
                return
            }

            try {
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
                if (prepared.requiresDispose) {
                    get().clearProjectionDirty({
                        performerIds: [performer.id],
                        actIds: [actId],
                        draftIds: collectRuntimeDraftIds(runtimeConfig),
                        workspaceWide: true,
                    })
                }
                // Settlement detection is now handled by entity store via session.idle SSE events.
                scheduleStreamingRecoverySync(chatKey, sessionId)
            } catch (error) {
                logChatDebug('send', 'act prompt failed', {
                    chatKey,
                    sessionId,
                    error: error instanceof Error ? error.message : String(error),
                })
                rollbackOptimisticMessage(chatKey, optimisticActMsg.id, sessionId)
                const errorActMsg = {
                    id: `msg-${Date.now()}`,
                    role: 'system' as const,
                    content: formatStudioApiErrorMessage(error),
                    timestamp: Date.now(),
                }
                addChatMessage(set, get, chatKey, errorActMsg)
                if (sessionId) {
                    get().setSessionLoading(sessionId, false)
                }
            }
        },

        executeSlashCommand: async (performerId: string, cmd: string) => {
            const state = get()
            const sessionId = resolveChatKeySession(get, performerId)
            if (!sessionId) return

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
                get().setSessionLoading(sessionId, false)
            }
        },
    }
}
