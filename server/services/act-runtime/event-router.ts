/**
 * event-router.ts — Subscription + relation-based event routing
 *
 * PRD §15.2: Routes events to performers based on:
 * 1. Subscription + relation permission match
 * 2. WakeCondition satisfaction
 */

import type {
    MailboxEvent,
    ActDefinition,
    ActRelation,
    PerformerSubscriptions,
    WakeCondition,
    BoardEntry,
} from '../../../shared/act-types.js'
import { Mailbox } from './mailbox.js'
import { evaluateWakeCondition } from './wake-evaluator.js'

// ── Types ───────────────────────────────────────────────

export interface WakeUpTarget {
    performerKey: string
    triggerEvent: MailboxEvent
    wakeCondition?: WakeCondition  // set if condition-triggered
    reason: 'subscription' | 'wake-condition'
}

// ── Subscription matching ───────────────────────────────

function matchSubscription(
    subscriptions: PerformerSubscriptions | undefined,
    event: MailboxEvent,
): boolean {
    if (!subscriptions) return false

    const payload = event.payload as Record<string, any>

    switch (event.type) {
        case 'message.sent':
        case 'message.delivered': {
            const from = payload.from as string | undefined
            const tag = payload.tag as string | undefined
            const fromMatch = subscriptions.messagesFrom?.includes(from || '') ?? false
            const tagMatch = subscriptions.messageTags?.includes(tag || '') ?? false
            return fromMatch || tagMatch
        }
        case 'board.posted':
        case 'board.updated': {
            const key = payload.key as string | undefined
            if (!key) return false
            return subscriptions.boardKeys?.some((pattern) => {
                if (pattern.endsWith('*')) {
                    return key.startsWith(pattern.slice(0, -1))
                }
                return key === pattern
            }) ?? false
        }
        case 'runtime.idle':
            return subscriptions.eventTypes?.includes('runtime.idle') ?? false
        default:
            return false
    }
}

// ── Relation permission check ───────────────────────────

function hasRelationPermission(
    performerKey: string,
    event: MailboxEvent,
    relations: ActRelation[],
): boolean {
    const source = event.source
    if (!source || source === performerKey) return false

    // Check if there's a relation between source and this performer
    return relations.some((rel) => {
        const [a, b] = rel.between
        const pairMatch = (a === source && b === performerKey) || (a === performerKey && b === source)
        if (!pairMatch) return false

        // For one-way relations, only the second (target) can be woken by the first (source)
        if (rel.direction === 'one-way') {
            return a === source && b === performerKey
        }
        return true
    })
}

// ── Main routing function ───────────────────────────────

export function routeEvent(
    event: MailboxEvent,
    actDefinition: ActDefinition,
    mailbox: Mailbox,
    recentEvents: MailboxEvent[],
): WakeUpTarget[] {
    const targets: WakeUpTarget[] = []
    const seen = new Set<string>()

    // 1. Subscription + relation based wake-up
    for (const [key, binding] of Object.entries(actDefinition.performers)) {
        if (key === event.source) continue  // Don't wake the source

        const subMatch = matchSubscription(binding.subscriptions, event)
        const relMatch = hasRelationPermission(key, event, actDefinition.relations)

        if (subMatch && relMatch) {
            targets.push({
                performerKey: key,
                triggerEvent: event,
                reason: 'subscription',
            })
            seen.add(key)
        }
    }

    // 2. WakeCondition based wake-up
    const triggeredConditions = mailbox.evaluateConditions(
        event,
        (cond: WakeCondition, board: Map<string, BoardEntry>, events: MailboxEvent[]) =>
            evaluateWakeCondition(cond, board, events),
        recentEvents,
    )

    for (const cond of triggeredConditions) {
        if (!seen.has(cond.createdBy)) {
            targets.push({
                performerKey: cond.createdBy,
                triggerEvent: event,
                wakeCondition: cond,
                reason: 'wake-condition',
            })
            seen.add(cond.createdBy)
        }
    }

    return targets
}
