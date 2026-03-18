/**
 * act-context-builder.ts — Act context injection
 *
 * PRD §9: Act context is injected as runtime prompt, not as Dance.
 * Includes: goal, participants, collaboration runtime, relations, subscriptions, dances, rules.
 */

import type { ActDefinition } from '../../../shared/act-types.js'
import type { Mailbox } from './mailbox.js'

/**
 * Build markdown Act context for a participant's agent prompt.
 */
export function buildActContext(
    actDefinition: ActDefinition,
    participantKey: string,
    _mailbox: Mailbox,
): string {
    const lines: string[] = []

    // ── Header ──────────────────────────────────────
    lines.push('# Act Context')
    if (actDefinition.description) {
        lines.push(`- 목표: ${actDefinition.description}`)
    }
    lines.push(`- Act: ${actDefinition.name}`)

    // ── Participants ─────────────────────────────────
    lines.push('- 참여자:')
    for (const [key, binding] of Object.entries(actDefinition.performers)) {
        const isSelf = key === participantKey
        lines.push(`  - ${key}${isSelf ? ' (너)' : ''}: ref=${binding.performerRef.kind}`)
    }
    lines.push('')

    // ── Collaboration Runtime ────────────────────────
    lines.push('# Collaboration Runtime')
    lines.push('- 이 Act에는 mailbox가 존재한다.')
    lines.push('- messages는 participant 간 1:1 통신이다. send_message tool을 사용하라.')
    lines.push('- board는 공유 knowledge 공간이다. post_to_board, read_board tool을 사용하라.')
    lines.push('- set_wake_condition으로 여러 결과를 기다린 후 다시 깨어날 수 있다.')
    lines.push('')

    // ── Available Relations ─────────────────────────
    const myRelations = actDefinition.relations.filter(
        (rel) => rel.between.includes(participantKey),
    )
    if (myRelations.length > 0) {
        lines.push('# Available Relations')
        for (const rel of myRelations) {
            const partner = rel.between[0] === participantKey ? rel.between[1] : rel.between[0]
            const dirLabel = rel.direction === 'one-way'
                ? (rel.between[0] === participantKey ? '→' : '←')
                : '↔'
            lines.push(`- ${participantKey} ${dirLabel} ${partner}: ${rel.name}${rel.description ? ` — ${rel.description}` : ''}`)
        }
        lines.push('')
    }

    // ── Subscriptions ───────────────────────────────
    const binding = actDefinition.performers[participantKey]
    if (binding?.subscriptions) {
        const subs = binding.subscriptions
        lines.push('# Your Subscriptions')
        if (subs.messagesFrom?.length) {
            lines.push(`- messages from: ${subs.messagesFrom.join(', ')}`)
        }
        if (subs.messageTags?.length) {
            lines.push(`- message tags: ${subs.messageTags.join(', ')}`)
        }
        if (subs.boardKeys?.length) {
            lines.push(`- board keys: ${subs.boardKeys.join(', ')}`)
        }
        if (subs.eventTypes?.length) {
            lines.push(`- event types: ${subs.eventTypes.join(', ')}`)
        }
        lines.push('')
    }

    // ── Active Dances ───────────────────────────────
    if (binding?.activeDanceIds && binding.activeDanceIds.length > 0) {
        lines.push('# Active Dances')
        for (const danceId of binding.activeDanceIds) {
            lines.push(`- ${danceId}`)
        }
        lines.push('')
    }

    // ── Act Rules ───────────────────────────────────
    if (actDefinition.actRules && actDefinition.actRules.length > 0) {
        lines.push('# Rules')
        for (const rule of actDefinition.actRules) {
            lines.push(`- ${rule}`)
        }
        lines.push('')
    }

    return lines.join('\n')
}
