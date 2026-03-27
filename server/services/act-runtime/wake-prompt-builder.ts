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

/**
 * Build a wake-up prompt for a participant being woken by an event.
 * The prompt describes only what happened right now and any pending messages.
 * Stable collaboration rules and tool guidance are injected at the agent/system level.
 */
export function buildWakePrompt(
    target: WakeUpTarget,
    mailbox: Mailbox,
    actDefinition?: ActDefinition,
): string {
    const parts: string[] = []
    const event = target.triggerEvent
    const payload = event.payload
    const participantName = (key: string | null | undefined) => {
        if (!key) return 'Someone'
        return actDefinition?.participants[key]?.displayName || key
    }

    // ── Event summary ───────────────────────────────
    if (target.reason === 'wake-condition' && target.wakeCondition) {
        parts.push(`[Resume]`)
        parts.push(target.wakeCondition.onSatisfiedMessage)
        parts.push('')
    } else {
        switch (event.type) {
            case 'message.sent':
                parts.push(`[Direct Message]`)
                parts.push(`${participantName(event.source)} sent you a direct message.${payloadString(payload, 'tag') ? ` label: ${payloadString(payload, 'tag')}` : ''}`)
                break
            case 'board.posted':
                parts.push(`[Shared Note Added]`)
                parts.push(`${participantName(event.source)} added a shared note with key "${payloadString(payload, 'key') || ''}".`)
                if (payloadString(payload, 'kind')) parts.push(`type: ${payloadString(payload, 'kind')}`)
                break
            case 'board.updated':
                parts.push(`[Shared Note Updated]`)
                parts.push(`${participantName(event.source)} updated the shared note with key "${payloadString(payload, 'key') || ''}".`)
                break
            case 'runtime.idle':
                parts.push(`[System Update]`)
                parts.push(`The collaboration runtime is idle.`)
                break
            default:
                parts.push(`[Update] ${event.type} from ${event.source}`)
        }
        parts.push('')
    }

    // ── Pending messages ────────────────────────────
    const pending = mailbox.getMessagesFor(target.participantKey)
    if (pending.length > 0) {
        parts.push(`--- Pending Direct Messages (${pending.length}) ---`)
        for (const msg of pending) {
            parts.push(`From: ${participantName(msg.from)}${msg.tag ? ` [${msg.tag}]` : ''}`)
            parts.push(msg.content)
            parts.push('')
        }
    }

    // ── Instruction ─────────────────────────────────
    parts.push('Review the latest shared context and decide your next step using the available coordination tools when helpful.')

    return parts.join('\n')
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
