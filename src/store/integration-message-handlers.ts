import type { ChatMessagePart } from '../types'
import type { StudioState } from './types'
import {
    applyTargetMessageUpdate,
    removeMessagePart,
    removeStreamingPartStoreEntry,
    resolveSessionTarget,
    streamingKey,
    streamingMessageKey,
    streamingMessageRoles,
    streamingPartContent,
    streamingPartKey,
    streamingPartKinds,
    streamingReasoningParts,
    streamingTextParts,
    updateStreamingPartStore,
    upsertMessagePart,
    upsertStreamingAssistant,
} from './integration-streaming'
import { handleAssistantToolCall } from '../features/assistant/assistant-actions'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

export function handleMessageUpdated(data: any, get: GetFn, set: SetFn) {
    const info = data.properties?.info
    if (!info?.sessionID || !info?.id || typeof info.role !== 'string') return

    if (info.role === 'user' || info.role === 'assistant' || info.role === 'system') {
        streamingMessageRoles.set(streamingMessageKey(info.sessionID, info.id), info.role)
    }
    if (info.role !== 'assistant') return

    const target = resolveSessionTarget(get(), info.sessionID)
    if (!target) return

    applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(
        messages,
        info.id,
        messages.find((message) => message.id === info.id)?.content || '',
        info.time?.created || Date.now(),
    ))
}

export function handleMessagePartUpdated(data: any, get: GetFn, set: SetFn) {
    const part = data.properties?.part
    if (!part?.sessionID || !part?.messageID) return

    const messageRole = streamingMessageRoles.get(streamingMessageKey(part.sessionID, part.messageID))
    if (messageRole !== 'assistant') return

    const target = resolveSessionTarget(get(), part.sessionID)
    if (!target) return

    if (part.type === 'text') {
        updateStreamingPartStore(
            streamingTextParts,
            part.sessionID,
            part.messageID,
            part.id,
            typeof part.text === 'string' ? part.text : '',
        )
        streamingPartKinds.set(streamingPartKey(part.sessionID, part.messageID, part.id), 'text')
        const content = streamingPartContent(streamingTextParts, part.sessionID, part.messageID)
        applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(messages, part.messageID, content))
        return
    }

    if (part.type === 'reasoning') {
        updateStreamingPartStore(
            streamingReasoningParts,
            part.sessionID,
            part.messageID,
            part.id,
            typeof part.text === 'string' ? part.text : '',
        )
        streamingPartKinds.set(streamingPartKey(part.sessionID, part.messageID, part.id), 'reasoning')
        const reasoningPart: ChatMessagePart = {
            id: part.id,
            type: 'reasoning',
            content: streamingReasoningParts.get(streamingKey(part.sessionID, part.messageID))?.get(part.id) || '',
        }
        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(messages, part.messageID, reasoningPart))
        return
    }

    if (part.type === 'tool') {
        const state = part.state || {}
        const toolPart: ChatMessagePart = {
            id: part.id,
            type: 'tool',
            tool: {
                name: part.tool || 'unknown',
                callId: part.callID || part.id,
                status: state.status || 'pending',
                title: state.title,
                input: state.input,
                output: state.output,
                error: state.error,
                time: state.time,
            },
        }

        if (target.kind === 'performer' && target.performerId === 'studio-assistant' && state.status === 'completed' && part.tool?.startsWith('assistant_')) {
            if (state.input) {
                setTimeout(() => {
                    handleAssistantToolCall(part.callID || part.id, part.tool, state.input)
                }, 10)
            }
        }

        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(messages, part.messageID, toolPart))
        return
    }

    if (part.type === 'step-start' || part.type === 'step-finish') {
        const stepPart: ChatMessagePart = {
            id: part.id,
            type: part.type,
            step: part.type === 'step-finish'
                ? { reason: part.reason, cost: part.cost, tokens: part.tokens }
                : undefined,
        }
        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(messages, part.messageID, stepPart))
        return
    }

    if (part.type === 'compaction') {
        const compactionPart: ChatMessagePart = {
            id: part.id,
            type: 'compaction',
            compaction: { auto: !!part.auto, overflow: part.overflow },
        }
        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(messages, part.messageID, compactionPart))
    }
}

export function handleMessagePartDelta(data: any, get: GetFn, set: SetFn) {
    const { sessionID, messageID, partID, field, delta } = data.properties || {}
    if (!sessionID || !messageID || !partID || field !== 'text' || typeof delta !== 'string') return

    const messageRole = streamingMessageRoles.get(streamingMessageKey(sessionID, messageID))
    if (messageRole !== 'assistant') return

    const target = resolveSessionTarget(get(), sessionID)
    if (!target) return

    const partKind = streamingPartKinds.get(streamingPartKey(sessionID, messageID, partID))

    if (partKind === 'text') {
        const current = streamingTextParts.get(streamingKey(sessionID, messageID))?.get(partID) || ''
        updateStreamingPartStore(streamingTextParts, sessionID, messageID, partID, `${current}${delta}`)
        const content = streamingPartContent(streamingTextParts, sessionID, messageID)
        applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(messages, messageID, content))
        return
    }

    if (partKind === 'reasoning') {
        const current = streamingReasoningParts.get(streamingKey(sessionID, messageID))?.get(partID) || ''
        updateStreamingPartStore(streamingReasoningParts, sessionID, messageID, partID, `${current}${delta}`)
        const reasoningPart: ChatMessagePart = {
            id: partID,
            type: 'reasoning',
            content: streamingReasoningParts.get(streamingKey(sessionID, messageID))?.get(partID) || '',
        }
        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(messages, messageID, reasoningPart))
    }
}

export function handleMessagePartRemoved(data: any, get: GetFn, set: SetFn) {
    const { sessionID, messageID, partID } = data.properties || {}
    if (!sessionID || !messageID || !partID) return

    const messageRole = streamingMessageRoles.get(streamingMessageKey(sessionID, messageID))
    if (messageRole !== 'assistant') return

    const target = resolveSessionTarget(get(), sessionID)
    if (!target) return

    const partKind = streamingPartKinds.get(streamingPartKey(sessionID, messageID, partID))
    if (partKind === 'text') {
        removeStreamingPartStoreEntry(streamingTextParts, sessionID, messageID, partID)
        streamingPartKinds.delete(streamingPartKey(sessionID, messageID, partID))
        const content = streamingPartContent(streamingTextParts, sessionID, messageID)
        applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(messages, messageID, content))
        return
    }

    if (partKind === 'reasoning') {
        removeStreamingPartStoreEntry(streamingReasoningParts, sessionID, messageID, partID)
        streamingPartKinds.delete(streamingPartKey(sessionID, messageID, partID))
        applyTargetMessageUpdate(set, target, (messages) => removeMessagePart(messages, messageID, partID))
    }
}
