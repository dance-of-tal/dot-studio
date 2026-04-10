/**
 * act-context-builder.ts — Collaboration context injection
 *
 * PRD §9: Stable collaboration context is injected at the agent/system level.
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

/**
 * Build markdown Act context for a participant's agent prompt.
 */
export function buildActContext(
    actDefinition: ActDefinition,
    participantKey: string,
): string {
    const lines: string[] = []
    const selfName = participantDisplayName(actDefinition, participantKey)
    const directPartners = directConnectionKeys(actDefinition, participantKey)
    const messageablePartners = messageablePartnerKeys(actDefinition, participantKey)

    // ── Header ──────────────────────────────────────
    lines.push('# Collaboration Context')
    if (actDefinition.description) {
        lines.push(`- Goal: ${actDefinition.description}`)
    }
    lines.push(`- Team: ${actDefinition.name}`)
    lines.push(`- Your role: ${selfName}`)
    const selfDescription = participantDescription(actDefinition, participantKey)
    if (selfDescription) {
        lines.push(`- Your focus: ${selfDescription}`)
    }
    lines.push('')

    // ── Collaboration Runtime ────────────────────────
    lines.push('# Coordination Tools')
    lines.push('- Use `message_teammate` for direct coordination with one teammate.')
    lines.push('- For `message_teammate`, set `recipient` to the teammate display name exactly as shown below. Do not pass relation names like `participant_1_to_participant_2`.')
    lines.push('- Use `update_shared_board` to keep compact shared state: decisions, task status, findings, and handoffs.')
    lines.push('- Write shared board entries as short Markdown summaries. Use headings, bullets, and checklists when they help teammates scan quickly.')
    lines.push('- Do not use the shared board as the storage location for full deliverables. Keep final outputs in the working directory or the proper destination, then post a short Markdown handoff or summary.')
    lines.push('- Use `read_shared_board` for the relevant key you need. Avoid reading the full board unless you need a full resync.')
    lines.push('- Before acting, check only the sender or shared note key relevant to the current event.')
    lines.push('- Prefer replacing stale shared notes with a fresh summary instead of appending long incremental logs.')
    lines.push('- Use `wait_until` instead of polling the full shared board when you are blocked on future input.')
    lines.push('- Common wait conditions: `message_received`, `board_key_exists`, and `wake_at`.')
    lines.push('- Use `all_of` or `any_of` only when you need to combine conditions.')
    lines.push('- `wake_at` schedules your own self-wake at an absolute timestamp.')
    lines.push('')

    const teammateNames = messageablePartners.map((key) => participantDisplayName(actDefinition, key))
    if (teammateNames.length > 0) {
        lines.push('# Valid Teammates')
        lines.push(`- Use these names as ` + '`recipient`' + ` values: ${teammateNames.join(', ')}`)
        lines.push('')
    }

    // ── Available Relations ─────────────────────────
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

    // ── Coordination Signals ────────────────────────
    const signalLines = coordinationSignalLines(actDefinition, directPartners)
    if (signalLines.length > 0) {
        lines.push('# Coordination Signals')
        lines.push(...signalLines)
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
