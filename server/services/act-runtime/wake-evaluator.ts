/**
 * wake-evaluator.ts — WakeCondition evaluation engine
 *
 * PRD §14: Evaluates condition expressions against board and event state.
 * Supports all_of, any_of, board_key_exists, message_received, and wake_at.
 */

import type {
    ConditionExpr,
    WakeCondition,
    BoardEntry,
    MailboxEvent,
    ActDefinition,
} from '../../../shared/act-types.js'

function participantDisplayName(
    actDefinition: ActDefinition | undefined,
    participantKey: string | undefined,
) {
    if (!actDefinition || !participantKey) {
        return null
    }
    const displayName = actDefinition.participants[participantKey]?.displayName?.trim()
    return displayName || null
}

function matchesParticipantReference(
    actDefinition: ActDefinition | undefined,
    participantKey: string | undefined,
    reference: string,
) {
    const normalizedReference = reference.trim().toLowerCase()
    if (!normalizedReference || !participantKey) {
        return false
    }
    if (participantKey.trim().toLowerCase() === normalizedReference) {
        return true
    }
    const displayName = participantDisplayName(actDefinition, participantKey)
    return displayName?.toLowerCase() === normalizedReference
}

/**
 * Evaluate a single ConditionExpr against the current context.
 */
export function evaluateConditionExpr(
    expr: ConditionExpr,
    context: {
        board: Map<string, BoardEntry>
        recentEvents: MailboxEvent[]
        actDefinition?: ActDefinition
    },
): boolean {
    switch (expr.type) {
        case 'all_of':
            return expr.conditions.every((sub) => evaluateConditionExpr(sub, context))

        case 'any_of':
            return expr.conditions.some((sub) => evaluateConditionExpr(sub, context))

        case 'board_key_exists':
            return context.board.has(expr.key)

        case 'message_received': {
            return context.recentEvents.some((event) => {
                if (event.type !== 'message.sent' && event.type !== 'message.delivered') {
                    return false
                }
                const payload = event.payload as { from?: string; tag?: string }
                const fromMatch = matchesParticipantReference(
                    context.actDefinition,
                    payload.from,
                    expr.from,
                )
                const tagMatch = !expr.tag || payload.tag === expr.tag
                return fromMatch && tagMatch
            })
        }

        case 'wake_at':
            return Date.now() >= expr.at

        default:
            return false
    }
}

/**
 * Evaluate a WakeCondition against the current mailbox state.
 * Returns true if the condition is satisfied.
 */
export function evaluateWakeCondition(
    condition: WakeCondition,
    board: Map<string, BoardEntry>,
    recentEvents: MailboxEvent[],
    actDefinition?: ActDefinition,
): boolean {
    if (condition.status !== 'waiting') return false
    return evaluateConditionExpr(condition.condition, { board, recentEvents, actDefinition })
}
