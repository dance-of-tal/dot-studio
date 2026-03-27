/**
 * act-context-builder.ts — Collaboration context injection
 *
 * PRD §9: Stable collaboration context is injected at the agent/system level.
 * Includes: goal, participants, collaboration tools, relations, subscriptions, and rules.
 */

import type { ActDefinition } from '../../../shared/act-types.js'

function participantDisplayName(actDefinition: ActDefinition, participantKey: string) {
    return actDefinition.participants[participantKey]?.displayName || participantKey
}

/**
 * Build markdown Act context for a participant's agent prompt.
 */
export function buildActContext(
    actDefinition: ActDefinition,
    participantKey: string,
): string {
    const lines: string[] = []
    const selfName = participantDisplayName(actDefinition, participantKey)

    // ── Header ──────────────────────────────────────
    lines.push('# Collaboration Context')
    if (actDefinition.description) {
        lines.push(`- Goal: ${actDefinition.description}`)
    }
    lines.push(`- Team: ${actDefinition.name}`)
    lines.push(`- Your role: ${selfName}`)

    // ── Participants ─────────────────────────────────
    lines.push('- Team members:')
    for (const key of Object.keys(actDefinition.participants)) {
        const isSelf = key === participantKey
        lines.push(`  - ${participantDisplayName(actDefinition, key)}${isSelf ? ' (you)' : ''}`)
    }
    lines.push('')

    // ── Collaboration Runtime ────────────────────────
    lines.push('# Coordination Tools')
    lines.push('- Use `message_teammate` for direct coordination with one teammate.')
    lines.push('- Use `update_shared_board` to publish durable notes, findings, tasks, and handoffs for the whole team.')
    lines.push('- Use `read_shared_board` to review current shared context before acting.')
    lines.push('- Use `wait_until` when you need to pause until future messages or shared updates arrive.')
    lines.push('')

    // ── Available Relations ─────────────────────────
    const myRelations = actDefinition.relations.filter(
        (rel) => rel.between.includes(participantKey),
    )
    if (myRelations.length > 0) {
        lines.push('# Team Connections')
        for (const rel of myRelations) {
            const partner = rel.between[0] === participantKey ? rel.between[1] : rel.between[0]
            const partnerName = participantDisplayName(actDefinition, partner)
            const dirLabel = rel.direction === 'one-way'
                ? (rel.between[0] === participantKey ? '→' : '←')
                : '↔'
            lines.push(`- ${selfName} ${dirLabel} ${partnerName}: ${rel.name}${rel.description ? ` — ${rel.description}` : ''}`)
        }
        lines.push('')
    }

    // ── Subscriptions ───────────────────────────────
    const binding = actDefinition.participants[participantKey]
    if (binding?.subscriptions) {
        const subs = binding.subscriptions
        lines.push('# Notifications You Receive')
        if (subs.messagesFrom?.length) {
            lines.push(`- Direct messages from: ${subs.messagesFrom.map((key) => participantDisplayName(actDefinition, key)).join(', ')}`)
        }
        if (subs.messageTags?.length) {
            lines.push(`- Message labels: ${subs.messageTags.join(', ')}`)
        }
        if (subs.callboardKeys?.length) {
            lines.push(`- Shared note keys: ${subs.callboardKeys.join(', ')}`)
        }
        if (subs.eventTypes?.length) {
            lines.push(`- System updates: ${subs.eventTypes.join(', ')}`)
        }
        lines.push('')
    }

    // activeDances section removed per PRD-005
    // Performer uses all its dances by default

    // ── Act Rules ───────────────────────────────────
    if (actDefinition.actRules && actDefinition.actRules.length > 0) {
        lines.push('# Working Rules')
        for (const rule of actDefinition.actRules) {
            lines.push(`- ${rule}`)
        }
        lines.push('')
    }

    return lines.join('\n')
}
