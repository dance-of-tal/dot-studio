// Choreography Act — Shared Types (PRD-003)
// Mailbox, Board, Events, WakeCondition, Relations, Act Definition, Thread

import type { SharedAssetRef } from './chat-contracts.js'

// ── Mailbox Messages ────────────────────────────────────

export interface MailboxMessage {
    id: string
    from: string          // performerKey
    to: string            // performerKey
    content: string
    threadId?: string
    correlationId?: string
    tag?: string          // review-request, clarification, approval-needed etc.
    timestamp: number
    status: 'pending' | 'delivered'
}

// ── Board ───────────────────────────────────────────────

export interface BoardEntry {
    id: string
    key: string
    kind: 'artifact' | 'fact' | 'task'
    author: string
    content: string
    metadata?: Record<string, unknown>
    version: number
    timestamp: number
    ownership: 'authoritative' | 'collaborative'
    updateMode: 'replace' | 'append'
    writePolicy?: 'author-only' | 'relation-peers' | 'any'
    status?: 'open' | 'in_progress' | 'done'   // kind='task'
    threadId?: string
    correlationId?: string
}

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

export interface PerformerSubscriptions {
    messagesFrom?: string[]
    messageTags?: string[]
    boardKeys?: string[]
    eventTypes?: MailboxEventType[]
}

// ── Act Relation (communication contract) ───────────────

export interface ActRelation {
    id: string
    between: [string, string]           // performer pair
    direction: 'both' | 'one-way'
    name: string
    description?: string
    permissions?: {
        boardKeys?: string[]
        messageTags?: string[]
    }
    maxCalls: number
    timeout: number
    sessionPolicy?: 'fresh' | 'reuse'
}

// ── Act Performer Binding ───────────────────────────────

export interface ActPerformerBinding {
    performerRef: SharedAssetRef
    activeDanceIds?: string[]
    subscriptions?: PerformerSubscriptions
}

// ── Act Definition ──────────────────────────────────────

export interface ActDefinition {
    id: string
    name: string
    description?: string
    actRules?: string[]
    performers: Record<string, ActPerformerBinding>  // performerKey → binding
    relations: ActRelation[]
}

// ── Mailbox (runtime state) ─────────────────────────────

export interface MailboxState {
    pendingMessages: MailboxMessage[]
    board: Record<string, BoardEntry>
    wakeConditions: WakeCondition[]
}

// ── Act Thread ──────────────────────────────────────────

export type ActThreadStatus = 'active' | 'idle' | 'completed' | 'interrupted'

export interface ActThread {
    id: string
    actId: string
    mailbox: MailboxState
    performerSessions: Record<string, string>  // performerKey → sessionId
    createdAt: number
    status: ActThreadStatus
}
