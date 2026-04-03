import { hasModelConfig, resolvePerformerRuntimeConfig } from '../../lib/performers'
import type { ChatMessage, PerformerNode } from '../../types'
import { buildActParticipantChatKey, describeChatTarget } from '../../../shared/chat-targets'
import { describeActParticipantRef, resolveActParticipantPerformer } from '../../lib/act-participants'
import { ensureSession, moveDraftMessageToSession, registerSessionBinding, resolveChatKeySession } from '../session'
import type { ChatGet, ChatSet } from './chat-internals'

export type ResolvedActSendContext =
    | {
        kind: 'ready'
        actId: string
        threadId: string
        participantKey: string
        participantLabel: string
        chatKey: string
        performer: PerformerNode
        runtimeConfig: ReturnType<typeof resolvePerformerRuntimeConfig>
    }
    | {
        kind: 'notice'
        chatKey: string
        message: string
    }
    | null

export function resolveActSendContext(
    get: ChatGet,
    actId: string,
    threadId: string,
    participantKey: string,
): ResolvedActSendContext {
    const act = get().acts.find((entry) => entry.id === actId)
    if (!act || !threadId) {
        return null
    }

    const binding = act.participants[participantKey]
    if (!binding) {
        return null
    }

    const participantLabel = binding.displayName || participantKey
    const chatKey = buildActParticipantChatKey(actId, threadId, participantKey)
    const performer = resolveActParticipantPerformer(act, participantKey, get().performers)
    if (!performer) {
        return {
            kind: 'notice',
            chatKey,
            message:
                `Cannot resolve performer for participant "${participantLabel}" ` +
                `(ref: ${describeActParticipantRef(binding, participantKey)}). ` +
                'No matching local performer node found. Try re-importing the Act or creating a performer manually.',
        }
    }

    const runtimeConfig = resolvePerformerRuntimeConfig(performer)
    if (!hasModelConfig(runtimeConfig.model)) {
        return {
            kind: 'notice',
            chatKey,
            message:
                `Model not configured for performer "${performer.name}". ` +
                'Open the performer editor and set up a model before sending messages.',
        }
    }

    return {
        kind: 'ready',
        actId,
        threadId,
        participantKey,
        participantLabel,
        chatKey,
        performer,
        runtimeConfig,
    }
}

export function createOptimisticActMessage(
    text: string,
    runtimeConfig: ReturnType<typeof resolvePerformerRuntimeConfig>,
): ChatMessage {
    return {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        metadata: {
            agentName: runtimeConfig.agentId || 'build',
            modelId: runtimeConfig.model?.modelId,
            provider: runtimeConfig.model?.provider,
            variant: runtimeConfig.modelVariant || undefined,
        },
    }
}

export function primeExistingActSession(set: ChatSet, get: ChatGet, chatKey: string) {
    const sessionId = resolveChatKeySession(get, chatKey) || undefined
    if (!sessionId) {
        return undefined
    }

    registerSessionBinding(set, get, chatKey, sessionId)
    get().clearSessionRevert(sessionId)
    get().setSessionLoading(sessionId, true)
    return sessionId
}

export async function ensureActSendSession(params: {
    set: ChatSet
    get: ChatGet
    chatKey: string
    performerName: string
    optimisticMessageId: string
}) {
    const { set, get, chatKey, performerName, optimisticMessageId } = params
    let sessionId = resolveChatKeySession(get, chatKey) || undefined

    if (sessionId) {
        return sessionId
    }

    sessionId = await ensureSession(set, get, describeChatTarget(chatKey), {
        title: performerName || 'Performer',
        clearDrafts: false,
    })
    get().clearSessionRevert(sessionId)
    moveDraftMessageToSession(set, get, chatKey, sessionId, optimisticMessageId)
    get().setSessionLoading(sessionId, true)
    await get().listSessions()
    return sessionId
}
