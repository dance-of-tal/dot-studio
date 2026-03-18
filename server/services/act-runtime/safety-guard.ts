/**
 * safety-guard.ts — Safety & Guard for Act runtime
 *
 * PRD §16: Event budget, loop detection, timeout, idle detection, permission checks.
 */

import type { ActRelation, ActThread, BoardEntry, MailboxEvent } from '../../../shared/act-types.js'
import type { Mailbox } from './mailbox.js'
import type { SessionQueue } from './session-queue.js'

// ── Configuration ───────────────────────────────────────

export interface SafetyConfig {
    /** Maximum total events per Act thread */
    maxEventsPerAct: number
    /** Maximum messages between any pair of performers */
    maxMessagesPerPair: number
    /** Maximum updates to a single board key */
    maxBoardUpdatesPerKey: number
    /** Quiet window (ms) — idle detection threshold */
    quietWindowMs: number
    /** Number of repeated A→B→A patterns to detect loops */
    loopDetectionThreshold: number
    /** Thread timeout (ms) */
    threadTimeoutMs: number
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
    maxEventsPerAct: 500,
    maxMessagesPerPair: 50,
    maxBoardUpdatesPerKey: 100,
    quietWindowMs: 60_000,        // 1 minute
    loopDetectionThreshold: 5,
    threadTimeoutMs: 30 * 60_000, // 30 minutes
}

// ── Safety Guard ────────────────────────────────────────

export class SafetyGuard {
    private eventCounts: Map<string, number> = new Map()
    private pairMessageCounts: Map<string, number> = new Map()
    private boardUpdateCounts: Map<string, number> = new Map()
    private recentPairs: string[] = []  // for loop detection

    private readonly config: SafetyConfig

    constructor(config?: Partial<SafetyConfig>) {
        this.config = { ...DEFAULT_SAFETY_CONFIG, ...config }
    }

    /**
     * Check total event budget for the Act thread.
     */
    checkEventBudget(event: MailboxEvent): { ok: boolean; reason?: string } {
        const threadKey = (event.payload as any)?.threadId || 'default'
        const current = (this.eventCounts.get(threadKey) || 0) + 1
        this.eventCounts.set(threadKey, current)

        if (current > this.config.maxEventsPerAct) {
            return { ok: false, reason: `Event budget exceeded (${this.config.maxEventsPerAct} max). Thread should be completed.` }
        }
        return { ok: true }
    }

    /**
     * Check messages between a pair of performers.
     */
    checkPairBudget(from: string, to: string): { ok: boolean; reason?: string } {
        const key = [from, to].sort().join(':')
        const current = (this.pairMessageCounts.get(key) || 0) + 1
        this.pairMessageCounts.set(key, current)

        if (current > this.config.maxMessagesPerPair) {
            return { ok: false, reason: `Message limit between ${from} and ${to} exceeded (${this.config.maxMessagesPerPair} max).` }
        }
        return { ok: true }
    }

    /**
     * Check board update count for a key.
     */
    checkBoardUpdateBudget(key: string): { ok: boolean; reason?: string } {
        const current = (this.boardUpdateCounts.get(key) || 0) + 1
        this.boardUpdateCounts.set(key, current)

        if (current > this.config.maxBoardUpdatesPerKey) {
            return { ok: false, reason: `Board key "${key}" update limit exceeded (${this.config.maxBoardUpdatesPerKey} max).` }
        }
        return { ok: true }
    }

    /**
     * Check for loop patterns (A→B→A→B repeated).
     */
    checkLoopDetection(from: string, to: string, _tag?: string): { ok: boolean; reason?: string } {
        const pair = `${from}→${to}`
        this.recentPairs.push(pair)

        // Keep only recent entries
        if (this.recentPairs.length > this.config.loopDetectionThreshold * 4) {
            this.recentPairs = this.recentPairs.slice(-this.config.loopDetectionThreshold * 4)
        }

        // Detect A→B→A→B pattern
        const reversePair = `${to}→${from}`
        let alternations = 0
        for (let i = this.recentPairs.length - 1; i >= 1; i--) {
            const current = this.recentPairs[i]
            const prev = this.recentPairs[i - 1]
            if ((current === pair && prev === reversePair) || (current === reversePair && prev === pair)) {
                alternations++
            }
        }

        if (alternations >= this.config.loopDetectionThreshold) {
            return { ok: false, reason: `Loop detected between ${from} and ${to} (${alternations} alternations). Breaking loop.` }
        }
        return { ok: true }
    }

    /**
     * Check thread timeout.
     */
    checkTimeout(thread: ActThread): { ok: boolean; reason?: string } {
        const elapsed = Date.now() - thread.createdAt
        if (elapsed > this.config.threadTimeoutMs) {
            return { ok: false, reason: `Thread timeout exceeded (${Math.round(this.config.threadTimeoutMs / 60_000)} minutes max).` }
        }
        return { ok: true }
    }

    /**
     * Check idle condition: no pending work in mailbox or queue.
     */
    checkIdleCondition(mailbox: Mailbox, queue: SessionQueue): boolean {
        const hasPending = mailbox.getAllPendingMessages().length > 0
        const hasQueued = queue.hasAnyPending()
        const hasWakeConditions = mailbox.getWakeConditions().length > 0
        return !hasPending && !hasQueued && !hasWakeConditions
    }

    /**
     * Check permission: does a relation exist between from and to?
     */
    checkPermission(from: string, to: string, relations: ActRelation[]): { ok: boolean; reason?: string } {
        const hasRelation = relations.some((rel) => {
            const [a, b] = rel.between
            if (rel.direction === 'one-way') {
                return a === from && b === to
            }
            return (a === from && b === to) || (a === to && b === from)
        })

        if (!hasRelation) {
            return { ok: false, reason: `No relation exists between "${from}" and "${to}". Cannot send message.` }
        }
        return { ok: true }
    }

    /**
     * Check board write policy.
     */
    checkBoardWritePolicy(entry: BoardEntry, author: string): { ok: boolean; reason?: string } {
        const wp = entry.writePolicy || 'any'
        if (wp === 'author-only' && entry.author !== author) {
            return { ok: false, reason: `Board key "${entry.key}" is author-only and owned by "${entry.author}".` }
        }
        return { ok: true }
    }

    /**
     * Reset all counters (for new thread).
     */
    reset(): void {
        this.eventCounts.clear()
        this.pairMessageCounts.clear()
        this.boardUpdateCounts.clear()
        this.recentPairs = []
    }
}
