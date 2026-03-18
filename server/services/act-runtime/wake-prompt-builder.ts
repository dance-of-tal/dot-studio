/**
 * wake-prompt-builder.ts — Wake-up prompt generation
 *
 * PRD §15.3: BFF tells performer WHAT HAPPENED, not WHAT TO DO.
 * Wake prompts are informational summaries injected into performer sessions.
 */

import type { MailboxMessage } from '../../../shared/act-types.js'
import type { WakeUpTarget } from './event-router.js'
import type { Mailbox } from './mailbox.js'

/**
 * Build a wake-up prompt for a performer being woken by an event.
 * The prompt describes what happened and includes pending messages.
 */
export function buildWakePrompt(target: WakeUpTarget, mailbox: Mailbox): string {
    const parts: string[] = []
    const event = target.triggerEvent
    const payload = event.payload as Record<string, any>

    // ── Event summary ───────────────────────────────
    if (target.reason === 'wake-condition' && target.wakeCondition) {
        parts.push(`[Wake Condition Satisfied]`)
        parts.push(target.wakeCondition.onSatisfiedMessage)
        parts.push('')
    } else {
        switch (event.type) {
            case 'message.sent':
                parts.push(`[메시지 알림]`)
                parts.push(`${event.source}이(가) 메시지를 보냈습니다.${payload.tag ? ` tag: ${payload.tag}` : ''}`)
                break
            case 'board.posted':
                parts.push(`[Board 알림]`)
                parts.push(`${event.source}이(가) key="${payload.key}" 항목을 게시했습니다.`)
                if (payload.kind) parts.push(`kind: ${payload.kind}`)
                break
            case 'board.updated':
                parts.push(`[Board 업데이트]`)
                parts.push(`${event.source}이(가) key="${payload.key}" 항목을 업데이트했습니다.`)
                break
            case 'runtime.idle':
                parts.push(`[Runtime 알림]`)
                parts.push(`Act runtime이 idle 상태입니다.`)
                break
            default:
                parts.push(`[알림] ${event.type} event from ${event.source}`)
        }
        parts.push('')
    }

    // ── Pending messages ────────────────────────────
    const pending = mailbox.getMessagesFor(target.performerKey)
    if (pending.length > 0) {
        parts.push(`--- 대기 중인 메시지 (${pending.length}건) ---`)
        for (const msg of pending) {
            parts.push(`From: ${msg.from}${msg.tag ? ` [${msg.tag}]` : ''}`)
            parts.push(msg.content)
            parts.push('')
        }
    }

    // ── Instruction ─────────────────────────────────
    parts.push('관련 board entry를 확인하고, 네 Tal과 active dances에 따라 필요한 행동을 판단하라.')

    return parts.join('\n')
}

/**
 * Mark all pending messages for the target performer as delivered.
 * Call this after the wake-up prompt has been injected into the session.
 */
export function markMessagesDelivered(
    mailbox: Mailbox,
    performerKey: string,
): MailboxMessage[] {
    const pending = mailbox.getMessagesFor(performerKey)
    for (const msg of pending) {
        mailbox.markDelivered(msg.id)
    }
    return pending
}
