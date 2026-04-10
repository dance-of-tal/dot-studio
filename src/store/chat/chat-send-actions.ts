import { buildActParticipantChatKey } from '../../../shared/chat-targets'
import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { toAssistantAvailableModels } from '../../lib/assistant-models'
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
} from '../session'
import { collectRuntimeDraftIds, preparePendingRuntimeExecution } from '../runtime-execution'

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
                    state.setAssistantModel(
                        availableAssistantModels.length > 0
                            ? { provider: availableAssistantModels[0].provider, modelId: availableAssistantModels[0].modelId }
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
                prepared.reason === 'projection_update_pending'
                    ? 'New chats are blocked until the current run finishes and Studio reapplies the latest projection changes.'
                    : 'New chats are blocked until the current run finishes and Studio reapplies the latest runtime changes.',
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

        try {
            logChatDebug('send', 'dispatch chat prompt', { chatKey, sessionId, target: target.kind })
            await api.chat.send(sessionId, {
                message: text,
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

            if (prepared.requiresDispose) {
                get().clearProjectionDirty({
                    performerIds: target.executionScope.clearPerformerIds,
                    actIds: target.executionScope.clearActIds,
                    draftIds: collectRuntimeDraftIds(runtimeConfig),
                    workspaceWide: true,
                })
            }

            if (target.kind !== 'act-participant') {
                get().watchSessionLifecycle(chatKey, sessionId)
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
