import { buildActParticipantChatKey } from '../../../shared/chat-targets'
import { deriveProvisionalThreadTitle } from '../../../shared/session-metadata'
import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import {
    pickPreferredAssistantModel,
    toAssistantAvailableModels,
} from '../../lib/assistant-models'
import { logChatDebug } from '../../lib/chat-debug'
import { hasModelConfig } from '../../lib/performers'
import type { AssetRef, ChatMessage } from '../../types'
import {
    appendChatMessage,
    appendChatSystemMessage,
    type ChatGet,
    type ChatSet,
} from './chat-internals'
import type { ChatRuntimeConfig } from './chat-runtime-target'
import { resolveChatRuntimeTarget } from './chat-runtime-target'
import {
    moveDraftMessageToSession,
    registerSessionBinding,
    resolveChatKeySession,
    selectMessagesForChatKey,
} from '../session'
import { preparePendingRuntimeExecution } from '../runtime-execution'
import { projectionDirtyPatchHasAny } from '../../../shared/projection-dirty'

const THREAD_TITLE_REFRESH_DELAYS_MS = [1_500, 5_000, 12_000]

function hasMatchingAssistantModel(
    models: Array<{ provider: string; modelId: string }>,
    model: { provider: string; modelId: string } | null,
) {
    if (!model) {
        return false
    }

    return models.some((entry) => entry.provider === model.provider && entry.modelId === model.modelId)
}

function createOptimisticUserMessage(
    text: string,
    runtimeConfig: ChatRuntimeConfig,
    attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
): ChatMessage {
    return {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        attachments: attachments && attachments.length > 0
            ? attachments.map((attachment) => ({
                type: attachment.type,
                filename: attachment.filename,
                mime: attachment.mime,
            }))
            : undefined,
        metadata: {
            agentName: runtimeConfig.agentId || 'build',
            modelId: runtimeConfig.model?.modelId,
            provider: runtimeConfig.model?.provider,
            variant: runtimeConfig.modelVariant || undefined,
        },
    }
}

export function createChatSendActions(
    set: ChatSet,
    get: ChatGet,
    createFreshSession: (
        chatKey: string,
        options?: {
            resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
            actId?: string
            performerName?: string
            preserveDraftMessages?: boolean
        },
    ) => Promise<{ sessionId: string | null; runtimeConfig: ChatRuntimeConfig }>,
) {
    const rollbackOptimisticMessage = (chatKey: string, messageId: string, sessionId?: string) => {
        get().removeChatDraftMessage(chatKey, messageId)
        if (sessionId) {
            get().removeSessionMessage(sessionId, messageId)
            get().setSessionLoading(sessionId, false)
        }
    }

    const applyOptimisticStandaloneSidebarTitle = (sessionId: string, sidebarTitle: string) => {
        const trimmed = sidebarTitle.trim()
        if (!trimmed) {
            return
        }

        set((state) => ({
            sessions: state.sessions.map((session) => (
                session.id === sessionId
                    ? { ...session, sidebarTitle: trimmed }
                    : session
            )),
        }))
    }

    const applyOptimisticActThreadName = (actId: string, threadId: string, name: string) => {
        const trimmed = name.trim()
        if (!trimmed) {
            return
        }

        set((state) => ({
            actThreads: {
                ...state.actThreads,
                [actId]: (state.actThreads[actId] || []).map((thread) => (
                    thread.id === threadId && !thread.name?.trim()
                        ? { ...thread, name: trimmed }
                        : thread
                )),
            },
        }))
    }

    const scheduleThreadTitleRefresh = (target: ReturnType<typeof resolveChatRuntimeTarget>) => {
        if (!target || target.kind === 'assistant') {
            return
        }

        const actId = target.requestTarget.actId
        const threadId = target.requestTarget.actThreadId
        for (const delay of THREAD_TITLE_REFRESH_DELAYS_MS) {
            setTimeout(() => {
                if (actId && threadId) {
                    void get().loadThreads(actId).catch(() => {})
                    return
                }
                void get().listSessions().catch(() => {})
            }, delay)
        }
    }

    const sendMessage = async (
        chatKey: string,
        text: string,
        attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
        extraDanceRefs: AssetRef[] = [],
    ) => {
        let sessionId: string | undefined = resolveChatKeySession(get, chatKey) || undefined
        let target = resolveChatRuntimeTarget(get, chatKey)
        if (!target) {
            return
        }

        if (target.kind === 'assistant' && target.assistantContext) {
            const refreshedModels = await api.models.list().catch(() => null)
            if (refreshedModels) {
                const availableAssistantModels = toAssistantAvailableModels(refreshedModels)
                get().setAssistantAvailableModels(availableAssistantModels)

                const state = get()
                if (!hasMatchingAssistantModel(availableAssistantModels, state.assistantModel)) {
                    const preferredModel = pickPreferredAssistantModel(availableAssistantModels)
                    state.setAssistantModel(
                        preferredModel
                            ? { provider: preferredModel.provider, modelId: preferredModel.modelId }
                            : null,
                    )
                }

                target = resolveChatRuntimeTarget(get, chatKey) || target
            }
        }

        if (target.notice) {
            appendChatSystemMessage(set, get, chatKey, target.notice)
            return
        }

        const { runtimeConfig } = target
        if (!hasModelConfig(runtimeConfig.model)) {
            return
        }

        const hasExistingUserMessages = selectMessagesForChatKey(get(), chatKey)
            .some((message) => message.role === 'user')
        const shouldSeedThreadTitle = target.kind !== 'assistant'
            && text.trim().length > 0
            && !hasExistingUserMessages
        const provisionalThreadTitle = shouldSeedThreadTitle
            ? deriveProvisionalThreadTitle(text)
            : null

        logChatDebug('send', 'sendMessage start', {
            chatKey,
            existingSessionId: sessionId || null,
            textLength: text.length,
            attachmentCount: attachments?.length || 0,
            target: target.kind,
        })

        const prepared = await preparePendingRuntimeExecution(get, {
            performerId: target.executionScope.performerId,
            actId: target.executionScope.actId,
            runtimeConfig,
        })
        if (prepared.blocked) {
            appendChatSystemMessage(
                set,
                get,
                chatKey,
                'You cannot start a new chat while another Studio session is still running. Wait for the current run to finish, then try again.',
            )
            return
        }

        const optimisticMsg = createOptimisticUserMessage(text, runtimeConfig, attachments)
        appendChatMessage(set, get, chatKey, optimisticMsg)

        const existingSessionId = resolveChatKeySession(get, chatKey) || undefined
        if (existingSessionId) {
            registerSessionBinding(set, get, chatKey, existingSessionId)
            get().clearSessionRevert(existingSessionId)
            get().setSessionLoading(existingSessionId, true)
        }

        get().initRealtimeEvents()

        if (!sessionId) {
            try {
                const freshSession = await createFreshSession(chatKey, {
                    preserveDraftMessages: true,
                    performerName: target.name,
                })
                sessionId = freshSession.sessionId || undefined
                if (sessionId) {
                    logChatDebug('send', 'created fresh session', { chatKey, sessionId, target: target.kind })
                    registerSessionBinding(set, get, chatKey, sessionId)
                    get().clearSessionRevert(sessionId)
                    moveDraftMessageToSession(set, get, chatKey, sessionId, optimisticMsg.id)
                    get().setSessionLoading(sessionId, true)
                }
            } catch (error) {
                console.error('Failed to create session', error)
                rollbackOptimisticMessage(chatKey, optimisticMsg.id)
                appendChatSystemMessage(set, get, chatKey, formatStudioApiErrorMessage(error))
                return
            }
        }

        if (!sessionId) {
            return
        }

        if (shouldSeedThreadTitle && provisionalThreadTitle) {
            if (target.requestTarget.actId && target.requestTarget.actThreadId) {
                applyOptimisticActThreadName(
                    target.requestTarget.actId,
                    target.requestTarget.actThreadId,
                    provisionalThreadTitle,
                )
            } else {
                applyOptimisticStandaloneSidebarTitle(sessionId, provisionalThreadTitle)
            }
        }

        try {
            logChatDebug('send', 'dispatch chat prompt', { chatKey, sessionId, target: target.kind })
            const projectionScope = projectionDirtyPatchHasAny(get().projectionDirty)
                ? get().projectionDirty
                : null
            await api.chat.send(sessionId, {
                message: text,
                projectionScope,
                performer: {
                    performerId: target.requestTarget.performerId,
                    performerName: target.requestTarget.performerName,
                    talRef: runtimeConfig.talRef,
                    danceRefs: runtimeConfig.danceRefs,
                    extraDanceRefs,
                    model: runtimeConfig.model,
                    modelVariant: runtimeConfig.modelVariant,
                    agentId: runtimeConfig.agentId,
                    mcpServerNames: runtimeConfig.mcpServerNames,
                    planMode: runtimeConfig.planMode,
                },
                attachments,
                ...(target.requestTarget.actId ? { actId: target.requestTarget.actId } : {}),
                ...(target.requestTarget.actThreadId ? { actThreadId: target.requestTarget.actThreadId } : {}),
                assistantContext: target.assistantContext || null,
            })

            if (target.kind !== 'act-participant') {
                get().watchSessionLifecycle(chatKey, sessionId)
            }
            if (shouldSeedThreadTitle) {
                scheduleThreadTitleRefresh(target)
            }
        } catch (error) {
            logChatDebug('send', 'chat prompt failed', {
                chatKey,
                sessionId,
                target: target.kind,
                error: error instanceof Error ? error.message : String(error),
            })
            rollbackOptimisticMessage(chatKey, optimisticMsg.id, sessionId)
            appendChatMessage(set, get, chatKey, {
                id: `msg-${Date.now()}`,
                role: 'system',
                content: formatStudioApiErrorMessage(error),
                timestamp: Date.now(),
            })
            get().setSessionLoading(sessionId, false)
        }
    }

    const sendActMessage = async (actId: string, threadId: string, participantKey: string, text: string) => {
        const chatKey = buildActParticipantChatKey(actId, threadId, participantKey)
        return sendMessage(chatKey, text)
    }

    return {
        sendMessage,
        sendActMessage,
    }
}
