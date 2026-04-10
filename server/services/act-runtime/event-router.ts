/**
 * event-router.ts — Subscription + relation-based event routing
 *
 * PRD §15.2: Routes events to participants based on:
 * 1. Subscription + relation permission match
 * 2. WakeCondition satisfaction
 */

import type {
    MailboxEvent,
    ActDefinition,
    ActRelation,
    ParticipantSubscriptions,
    WakeCondition,
    BoardEntry,
} from '../../../shared/act-types.js'
import { Mailbox } from './mailbox.js'
import { evaluateWakeCondition } from './wake-evaluator.js'
import { payloadString } from './act-runtime-utils.js'

// ── Types ───────────────────────────────────────────────

export interface WakeUpTarget {
    participantKey: string
    triggerEvent: MailboxEvent
    wakeCondition?: WakeCondition  // set if condition-triggered
    reason: 'subscription' | 'wake-condition'
}

// ── Subscription matching ───────────────────────────────

function matchSubscription(
    participantKey: string,
    subscriptions: ParticipantSubscriptions | undefined,
    event: MailboxEvent,
): boolean {
    if (!subscriptions) return false

    const payload = event.payload

    switch (event.type) {
        case 'message.sent':
        case 'message.delivered': {
            const to = payloadString(payload, 'to')
            if (to !== participantKey) {
                return false
            }
            const from = payloadString(payload, 'from')
            const tag = payloadString(payload, 'tag')
            const fromMatch = subscriptions.messagesFrom?.includes(from || '') ?? false
            const tagMatch = subscriptions.messageTags?.includes(tag || '') ?? false
            return fromMatch || tagMatch
        }
        case 'board.posted':
        case 'board.updated': {
            const key = payloadString(payload, 'key')
            if (!key) return false
            return subscriptions.callboardKeys?.some((pattern) => {
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
    participantKey: string,
    event: MailboxEvent,
    relations: ActRelation[],
): boolean {
    const source = event.source
    if (!source || source === participantKey) return false

    // Check if there's a relation between source and this participant
    return relations.some((rel) => {
        const [a, b] = rel.between
        const pairMatch = (a === source && b === participantKey) || (a === participantKey && b === source)
        if (!pairMatch) return false

        // For one-way relations, only the second (target) can be woken by the first (source)
        if (rel.direction === 'one-way') {
            return a === source && b === participantKey
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
    const targetsByParticipant = new Map<string, WakeUpTarget>()

    // 1. Subscription + relation based wake-up
    for (const [key, binding] of Object.entries(actDefinition.participants)) {
        if (key === event.source) continue  // Don't wake the source

        const subMatch = matchSubscription(key, binding.subscriptions, event)
        const relMatch = hasRelationPermission(key, event, actDefinition.relations)

        // Direct message: always wake the recipient if relation allows it.
        // 1:1 messages don't need explicit subscription — the `to` field is the routing key.
        const isDirectMessageTarget =
            (event.type === 'message.sent' || event.type === 'message.delivered') &&
            payloadString(event.payload, 'to') === key

        if ((subMatch && relMatch) || (isDirectMessageTarget && relMatch)) {
            targetsByParticipant.set(key, {
                participantKey: key,
                triggerEvent: event,
                reason: 'subscription',
            })
        }
    }

    // 2. WakeCondition based wake-up
    const triggeredConditions = mailbox.evaluateConditions(
        event,
        (cond: WakeCondition, board: Map<string, BoardEntry>, events: MailboxEvent[]) =>
            evaluateWakeCondition(cond, board, events, actDefinition),
        recentEvents,
    )

    for (const cond of triggeredConditions) {
        targetsByParticipant.set(cond.createdBy, {
            participantKey: cond.createdBy,
            triggerEvent: event,
            wakeCondition: cond,
            reason: 'wake-condition',
        })
    }

    return Array.from(targetsByParticipant.values())
}
