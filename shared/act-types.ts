// Choreography Act — Shared Types (PRD-003)
// Mailbox, Board, Events, WakeCondition, Relations, Act Definition, Thread

import type { SharedAssetRef } from './chat-contracts.js'

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
    kind: 'artifact' | 'fact' | 'task' | 'note'
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

// ── Subscriptions ───────────────────────────────────────

export interface ParticipantSubscriptions {
    messagesFrom?: string[]
    messageTags?: string[]
    callboardKeys?: string[]
    eventTypes?: MailboxEventType[]
}

// ── Act Relation (communication contract) ───────────────

export interface ActRelation {
    id: string
    between: [string, string]           // participant pair
    direction: 'both' | 'one-way'
    name: string
    description?: string
    permissions?: {
        callboardKeys?: string[]
        messageTags?: string[]
    }
    maxCalls: number
    timeout: number
}

// ── Act Participant Binding ─────────────────────────────

export interface ActParticipantBinding {
    performerRef: SharedAssetRef
    activeDanceIds?: string[]
    subscriptions?: ParticipantSubscriptions
}

// ── Act Definition ──────────────────────────────────────

export interface ActDefinition {
    id: string
    name: string
    description?: string
    actRules?: string[]
    participants: Record<string, ActParticipantBinding>  // participantKey → binding
    relations: ActRelation[]
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
