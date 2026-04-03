// Choreography Act — Shared Types (PRD-005)
// dot contract types are Source of Truth for the serialization schema.
// Studio extends them with runtime-only fields (id, performerRef, mailbox, etc.)

import type { SharedAssetRef } from './chat-contracts.js'
import type {
    ActRelationV1,
    ActParticipantSubscriptionsV1,
} from './dot-types.js'

// ── Re-export dot contract types as Studio aliases ──────

/** dot contract re-export — Subscriptions schema */
export type ParticipantSubscriptions = ActParticipantSubscriptionsV1

// Re-export the V1 types for direct use
export type { ActRelationV1, ActParticipantSubscriptionsV1 } from './dot-types.js'

// ── Mailbox Messages ────────────────────────────────────

export interface MailboxMessage {
    id: string
    from: string          // participantKey
    to: string            // participantKey
    content: string
    threadId?: string
    correlationId?: string
    tag?: string          // review-request, clarification, approval-needed etc.
    timestamp: number
    status: 'pending' | 'delivered'
}

export type CallboardMessage = MailboxMessage

// ── Board ───────────────────────────────────────────────

export interface BoardEntry {
    id: string
    key: string
    kind: 'artifact' | 'finding' | 'task' | 'note'
    author: string
    sourceType?: 'performer' | 'user' | 'system'
    content: string
    metadata?: Record<string, unknown>
    version: number
    timestamp: number
    pinned?: boolean
    locked?: boolean
    ownership: 'authoritative' | 'collaborative'
    updateMode: 'replace' | 'append'
    writePolicy?: 'author-only' | 'relation-peers' | 'any' | 'user-only'
    status?: 'open' | 'in_progress' | 'done'   // kind='task'
    threadId?: string
    correlationId?: string
}

export type CallboardEntry = BoardEntry

// ── Events ──────────────────────────────────────────────

export type MailboxEventType =
    | 'message.sent'
    | 'message.delivered'
    | 'board.posted'
    | 'board.updated'
    | 'runtime.reconfigured'
    | 'runtime.idle'

export interface MailboxEvent {
    id: string
    type: MailboxEventType
    sourceType: 'performer' | 'user' | 'system'
    source: string
    timestamp: number
    payload: Record<string, unknown>
}

export type CallboardEventType = MailboxEventType
export type CallboardEvent = MailboxEvent

// ── WakeCondition ───────────────────────────────────────

export type ConditionExpr =
    | { type: 'all_of'; conditions: ConditionExpr[] }
    | { type: 'any_of'; conditions: ConditionExpr[] }
    | { type: 'board_key_exists'; key: string }
    | { type: 'message_received'; from: string; tag?: string }
    | { type: 'timeout'; at: number }

export interface WakeCondition {
    id: string
    target: 'self'               // v1: self only
    createdBy: string            // performer who requested
    onSatisfiedMessage: string   // wake-up message on satisfy
    condition: ConditionExpr
    status: 'waiting' | 'triggered' | 'expired'
}

// ── Act Relation (extends dot contract with Studio id) ──
// dot ActRelationV1 = { between, direction, name, description }
// Studio adds `id` for internal tracking on the canvas.

export interface ActRelation extends ActRelationV1 {
    id: string
}

// ── Act Participant Binding ─────────────────────────────
// dot ActParticipantV1 uses `performer: string` (asset URN).
// Studio uses `performerRef: SharedAssetRef` (resolved ref).
// These are semantically different, so Studio keeps its own type.

export interface ActParticipantBinding {
    performerRef: SharedAssetRef
    displayName?: string
    description?: string
    subscriptions?: ParticipantSubscriptions
}

// ── Act Safety Config (runtime-only, not in asset) ──────

export interface ActSafetyConfig {
    maxEvents?: number                   // Act Thread total event cap. Default 300
    maxMessagesPerPair?: number          // per performer-pair message cap. Default 20
    maxBoardUpdatesPerKey?: number       // per board key update cap. Default 50
    quietWindowMs?: number               // idle quiet window. Default 45s
    threadTimeoutMs?: number             // Thread timeout. Default 15 min
    loopDetectionThreshold?: number      // ping-pong detection threshold. Default 4
}

// ── Act Definition ──────────────────────────────────────

export interface ActDefinition {
    id: string
    name: string
    description?: string
    actRules?: string[]
    participants: Record<string, ActParticipantBinding>  // participantKey → binding
    relations: ActRelation[]
    safety?: ActSafetyConfig
}

// ── Mailbox (runtime state) ─────────────────────────────

export interface MailboxState {
    pendingMessages: MailboxMessage[]
    board: Record<string, BoardEntry>
    wakeConditions: WakeCondition[]
}

export type CallboardState = MailboxState

// ── Act Thread ──────────────────────────────────────────

export type ActThreadStatus = 'active' | 'idle' | 'completed' | 'interrupted'

export interface ActThread {
    id: string
    actId: string
    mailbox: MailboxState
    participantSessions: Record<string, string>
    createdAt: number
    status: ActThreadStatus
}
