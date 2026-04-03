/**
 * wake-prompt-builder.ts — Wake-up prompt generation
 *
 * PRD §15.3: Act Runtime Engine tells a participant WHAT HAPPENED, not WHAT TO DO.
 * Wake prompts are informational summaries injected into participant sessions.
 */

import type { ActDefinition, MailboxMessage } from '../../../shared/act-types.js'
import type { WakeUpTarget } from './event-router.js'
import type { Mailbox } from './mailbox.js'
import { payloadString } from './act-runtime-utils.js'

export interface WakePromptMessageDelivery {
    from: string
    tag?: string
    content: string
}

export interface WakePromptResolution {
    cause: WakeUpTarget['reason']
    trigger:
        | { kind: 'resume'; instruction: string }
        | { kind: 'direct-message'; source: string; tag?: string }
        | { kind: 'shared-note-added'; source: string; key?: string; boardKind?: string }
        | { kind: 'shared-note-updated'; source: string; key?: string }
        | { kind: 'runtime-idle' }
        | { kind: 'event'; eventType: string; source: string }
    deliveries: {
        messages: WakePromptMessageDelivery[]
    }
}

function renderMessageBlock(message: WakePromptMessageDelivery): string[] {
    return [
        `From: ${message.from}${message.tag ? ` [${message.tag}]` : ''}`,
        message.content,
    ]
}

export function resolveWakePrompt(
    target: WakeUpTarget,
    mailbox: Mailbox,
    actDefinition?: ActDefinition,
): WakePromptResolution {
    const event = target.triggerEvent
    const payload = event.payload
    const participantName = (key: string | null | undefined) => {
        if (!key) return 'Someone'
        return actDefinition?.participants[key]?.displayName || key
    }
    const messages = mailbox.getMessagesFor(target.participantKey).map((msg) => ({
        from: participantName(msg.from),
        tag: msg.tag,
        content: msg.content,
    }))

    if (target.reason === 'wake-condition' && target.wakeCondition) {
        return {
            cause: target.reason,
            trigger: {
                kind: 'resume',
                instruction: target.wakeCondition.onSatisfiedMessage,
            },
            deliveries: { messages },
        }
    }

    switch (event.type) {
        case 'message.sent':
            return {
                cause: target.reason,
                trigger: {
                    kind: 'direct-message',
                    source: participantName(event.source),
                    tag: payloadString(payload, 'tag') || undefined,
                },
                deliveries: { messages },
            }
        case 'board.posted':
            return {
                cause: target.reason,
                trigger: {
                    kind: 'shared-note-added',
                    source: participantName(event.source),
                    key: payloadString(payload, 'key') || undefined,
                    boardKind: payloadString(payload, 'kind') || undefined,
                },
                deliveries: { messages },
            }
        case 'board.updated':
            return {
                cause: target.reason,
                trigger: {
                    kind: 'shared-note-updated',
                    source: participantName(event.source),
                    key: payloadString(payload, 'key') || undefined,
                },
                deliveries: { messages },
            }
        case 'runtime.idle':
            return {
                cause: target.reason,
                trigger: { kind: 'runtime-idle' },
                deliveries: { messages },
            }
        default:
            return {
                cause: target.reason,
                trigger: {
                    kind: 'event',
                    eventType: event.type,
                    source: event.source,
                },
                deliveries: { messages },
            }
    }
}

export function renderWakePrompt(resolution: WakePromptResolution): string {
    const parts: string[] = []
    const { trigger, deliveries } = resolution

    switch (trigger.kind) {
        case 'resume':
            parts.push('[Resume]')
            parts.push(trigger.instruction)
            parts.push('Your saved wait condition has been satisfied.')
            break
        case 'direct-message':
            if (deliveries.messages.length <= 1) {
                parts.push('[Direct Message]')
                const message = deliveries.messages[0]
                if (message) {
                    parts.push(...renderMessageBlock(message))
                } else {
                    parts.push(`${trigger.source} sent you a direct message.${trigger.tag ? ` label: ${trigger.tag}` : ''}`)
                }
                return parts.join('\n')
            }

            parts.push('[Direct Messages]')
            deliveries.messages.forEach((message, index) => {
                if (index > 0) parts.push('')
                parts.push(...renderMessageBlock(message))
            })
            return parts.join('\n')
        case 'shared-note-added':
            parts.push('[Shared Note Added]')
            parts.push(`${trigger.source} added a shared note${trigger.key ? ` with key "${trigger.key}"` : ''}.`)
            if (trigger.boardKind) parts.push(`type: ${trigger.boardKind}`)
            if (trigger.key) parts.push(`relevant key: ${trigger.key}`)
            break
        case 'shared-note-updated':
            parts.push('[Shared Note Updated]')
            parts.push(`${trigger.source} updated the shared note${trigger.key ? ` with key "${trigger.key}"` : ''}.`)
            if (trigger.key) parts.push(`relevant key: ${trigger.key}`)
            break
        case 'runtime-idle':
            parts.push('[System Update]')
            parts.push('The collaboration runtime is idle.')
            break
        case 'event':
            parts.push(`[Update] ${trigger.eventType} from ${trigger.source}`)
            break
    }

    if (deliveries.messages.length > 0) {
        parts.push('')
        parts.push(deliveries.messages.length === 1 ? '[Direct Message]' : '[Direct Messages]')
        deliveries.messages.forEach((message, index) => {
            if (index > 0) parts.push('')
            parts.push(...renderMessageBlock(message))
        })
    }

    return parts.join('\n')
}

/**
 * Build a wake-up prompt for a participant being woken by an event.
 * The prompt describes only what happened right now and any relevant direct messages.
 * Stable collaboration rules and tool guidance are injected at the agent/system level.
 */
export function buildWakePrompt(
    target: WakeUpTarget,
    mailbox: Mailbox,
    actDefinition?: ActDefinition,
): string {
    return renderWakePrompt(resolveWakePrompt(target, mailbox, actDefinition))
}

/**
 * Mark all pending messages for the target participant as delivered.
 * Call this after the wake-up prompt has been injected into the session.
 */
export function markMessagesDelivered(
    mailbox: Mailbox,
    participantKey: string,
): MailboxMessage[] {
    const pending = mailbox.getMessagesFor(participantKey)
    for (const msg of pending) {
        mailbox.markDelivered(msg.id)
    }
    return pending
}
