import type { ChatMessage, ChatMessageToolInfo } from '../../types'
import type { AssistantAction, AssistantActionEnvelope } from '../../../shared/assistant-actions'
import { ASSISTANT_MUTATION_TOOL_NAME } from '../../../shared/assistant-actions'
import {
    lintAssistantActionEnvelope,
    parseAssistantActionEnvelope,
} from '../../../shared/assistant-action-protocol'

export { ASSISTANT_MUTATION_TOOL_NAME, lintAssistantActionEnvelope, parseAssistantActionEnvelope }

export interface AssistantToolActionCall {
    callId: string
    actions: AssistantAction[]
    envelope: AssistantActionEnvelope
}

export interface PendingAssistantToolMessage {
    messageId: string
    actionCalls: AssistantToolActionCall[]
}

function isAssistantMutationTool(tool: ChatMessageToolInfo | undefined | null): tool is ChatMessageToolInfo {
    return !!tool && (
        tool.name === ASSISTANT_MUTATION_TOOL_NAME
        || tool.metadata?.studioAssistantMutation === true
    )
}

function isCompletedAssistantMutationTool(tool: ChatMessageToolInfo | undefined | null): tool is ChatMessageToolInfo {
    return isAssistantMutationTool(tool) && tool.status === 'completed'
}

function getAssistantToolEnvelope(tool: ChatMessageToolInfo): AssistantActionEnvelope | null {
    const envelope = parseAssistantActionEnvelope(tool.input)
    if (!envelope) {
        return null
    }

    const hasErrors = lintAssistantActionEnvelope(envelope).some((issue) => issue.level === 'error')
    return hasErrors ? null : envelope
}

export function getAssistantMessageActionCalls(
    message: Pick<ChatMessage, 'parts'>,
): AssistantToolActionCall[] {
    const calls: AssistantToolActionCall[] = []

    for (const part of message.parts || []) {
        if (part.type !== 'tool' || !isCompletedAssistantMutationTool(part.tool)) {
            continue
        }

        const envelope = getAssistantToolEnvelope(part.tool)
        if (!envelope) {
            continue
        }

        calls.push({
            callId: part.tool.callId,
            actions: envelope.actions,
            envelope,
        })
    }

    return calls
}

export function getPendingAssistantToolMessages(
    messages: Array<Pick<ChatMessage, 'id' | 'role' | 'parts'>>,
    appliedAssistantActionMessageIds: Record<string, true>,
): PendingAssistantToolMessage[] {
    const pending: PendingAssistantToolMessage[] = []

    for (const message of messages) {
        if (message.role !== 'assistant' || appliedAssistantActionMessageIds[message.id]) {
            continue
        }

        const actionCalls = getAssistantMessageActionCalls(message)
        if (actionCalls.length === 0) {
            continue
        }

        pending.push({
            messageId: message.id,
            actionCalls,
        })
    }

    return pending
}
