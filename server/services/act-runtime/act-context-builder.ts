/**
 * act-context-builder.ts — Collaboration system prompt construction
 *
 * PRD §9: Stable collaboration context is injected as a turn-scoped system prompt.
 * Includes: goal, participants, collaboration tools, relations, coordination signals, and rules.
 */

import type { ActDefinition } from '../../../shared/act-types.js'

function participantDisplayName(actDefinition: ActDefinition, participantKey: string) {
    return actDefinition.participants[participantKey]?.displayName || participantKey
}

function participantDescription(actDefinition: ActDefinition, participantKey: string) {
    const description = actDefinition.participants[participantKey]?.description?.trim()
    return description ? description : null
}

function directConnectionKeys(actDefinition: ActDefinition, participantKey: string): string[] {
    const partners = new Set<string>()

    for (const rel of actDefinition.relations) {
        if (!rel.between.includes(participantKey)) continue
        const partner = rel.between[0] === participantKey ? rel.between[1] : rel.between[0]
        if (partner) partners.add(partner)
    }

    return [...partners]
}

function messageablePartnerKeys(actDefinition: ActDefinition, participantKey: string): string[] {
    const partners = new Set<string>()

    for (const rel of actDefinition.relations) {
        const [left, right] = rel.between
        if (rel.direction === 'one-way') {
            if (left === participantKey && right) {
                partners.add(right)
            }
            continue
        }

        if (left === participantKey && right) {
            partners.add(right)
        } else if (right === participantKey && left) {
            partners.add(left)
        }
    }

    return [...partners]
}

function coordinationSignalLines(
    actDefinition: ActDefinition,
    participantKeys: string[],
): string[] {
    const lines: string[] = []

    for (const partnerKey of participantKeys) {
        const partnerName = participantDisplayName(actDefinition, partnerKey)
        const subscriptions = actDefinition.participants[partnerKey]?.subscriptions
        if (!subscriptions) continue

        if (subscriptions.messageTags?.length) {
            lines.push(`- Message tags for ${partnerName}: ${subscriptions.messageTags.join(', ')}`)
        }
        if (subscriptions.callboardKeys?.length) {
            lines.push(`- Shared note keys for ${partnerName}: ${subscriptions.callboardKeys.join(', ')}`)
        }
    }

    return lines
}

function listOrNone(items: string[]) {
    return items.length > 0 ? items.join(', ') : 'none'
}

/**
 * Build markdown Act context for a participant's system prompt.
 */
export function buildActContext(
    actDefinition: ActDefinition,
    participantKey: string,
): string {
    const lines: string[] = []
    const selfName = participantDisplayName(actDefinition, participantKey)
    const directPartners = directConnectionKeys(actDefinition, participantKey)
    const messageablePartners = messageablePartnerKeys(actDefinition, participantKey)
    const teammateNames = messageablePartners.map((key) => participantDisplayName(actDefinition, key))

    lines.push('# Act Runtime Context')
    if (actDefinition.description) {
        lines.push(`- Goal: ${actDefinition.description}`)
    }
    lines.push(`- Act: ${actDefinition.name}`)
    lines.push(`- Your role: ${selfName}`)
    const selfDescription = participantDescription(actDefinition, participantKey)
    if (selfDescription) {
        lines.push(`- Your focus: ${selfDescription}`)
    }
    lines.push('')

    lines.push('# Runtime Tools')
    lines.push('- `message_teammate({recipient,message,tag?})`: send one direct update. `recipient` must be one of the messageable names below; do not use relation names like `participant_1_to_participant_2`.')
    lines.push('- `update_shared_board({entryKey,entryType,content,mode?})`: publish compact Markdown for decisions, findings, tasks, status, and handoffs. Use `entryType`: `artifact`, `finding`, or `task`; prefer `mode:"replace"`.')
    lines.push('- `list_shared_board({kind?,mode?})`: inspect existing notes before choosing a key. Defaults to summaries; use `mode:"full"` only for a necessary resync.')
    lines.push('- `get_shared_board_entry({entryKey})`: read one exact key. Never pass placeholders like `recent` or category names like `artifact` as the key.')
    lines.push('- `wait_until({resumeWith,conditionJson})`: park yourself until future input. `conditionJson` must be JSON using `message_received`, `board_key_exists`, `wake_at`, `all_of`, or `any_of`.')
    lines.push('- Condition shapes: `{"type":"message_received","from":"Teammate","tag":"handoff"}`, `{"type":"board_key_exists","key":"review-summary"}`, `{"type":"wake_at","at":1735689600000}`. Use a direct connection display name for `from`.')
    lines.push('- After `wait_until`, end the turn immediately; do not call another runtime tool until resumed.')
    lines.push('')

    lines.push('# Messageable Teammates')
    lines.push(`- Valid ` + '`recipient`' + ` values: ${listOrNone(teammateNames)}`)
    lines.push('')

    const myRelations = actDefinition.relations.filter((rel) => rel.between.includes(participantKey))
    if (myRelations.length > 0) {
        lines.push('# Direct Connections')
        for (const rel of myRelations) {
            const partner = rel.between[0] === participantKey ? rel.between[1] : rel.between[0]
            const partnerName = participantDisplayName(actDefinition, partner)
            const partnerDescription = participantDescription(actDefinition, partner)
            const dirLabel = rel.direction === 'one-way'
                ? (rel.between[0] === participantKey ? '→' : '←')
                : '↔'
            lines.push(`- ${selfName} ${dirLabel} ${partnerName}: ${rel.name}${rel.description ? ` — ${rel.description}` : ''}`)
            if (partnerDescription) {
                lines.push(`  Partner focus: ${partnerName} — ${partnerDescription}`)
            }
        }
        lines.push('')
    } else {
        lines.push('# Direct Connections')
        lines.push('- No direct participant relations are configured for you.')
        lines.push('')
    }

    const signalLines = coordinationSignalLines(actDefinition, directPartners)
    if (signalLines.length > 0) {
        lines.push('# Teammate Wake Hints')
        lines.push(...signalLines)
        lines.push('- Reuse these tags or shared note keys when they fit. If you invent a new key or tag, make the message self-explanatory.')
        lines.push('')
    }

    lines.push('# Operating Rules')
    lines.push('- Before acting on a wake event, inspect only the sender, message, or shared note key relevant to that event.')
    lines.push('- Reuse the same shared note key for the same deliverable, decision, finding set, or task; create a new key only when the workstream splits.')
    lines.push('- Shared board notes are not final deliverable storage. Save real artifacts in the working directory or proper destination, then post a short handoff summary.')
    lines.push('- Use `wait_until` instead of polling when blocked on a teammate message, shared note, or scheduled self-wake.')

    if (actDefinition.actRules && actDefinition.actRules.length > 0) {
        for (const rule of actDefinition.actRules) {
            lines.push(`- ${rule}`)
        }
    }
    lines.push('')

    return lines.join('\n')
}
