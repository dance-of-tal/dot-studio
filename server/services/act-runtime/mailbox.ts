/**
 * mailbox.ts — Mailbox state management for Act Thread runtime
 *
 * PRD §6: Mailbox is the internal SoT for all Act collaboration state.
 * - pending messages (in-memory, transient)
 * - board (file-backed + memory cache, durable)
 * - wake conditions (in-memory, transient)
 */

import type {
    MailboxMessage,
    BoardEntry,
    MailboxEvent,
    WakeCondition,
    MailboxState,
} from '../../../shared/act-types.js'

import { nanoid } from 'nanoid'

// ── Mailbox ─────────────────────────────────────────────

export class Mailbox {
    // pending messages (in-memory, transient)
    private pendingMessages: MailboxMessage[] = []

    // board (file-backed + memory cache, durable)
    private board: Map<string, BoardEntry> = new Map()

    // wake conditions (in-memory, transient)
    private wakeConditions: WakeCondition[] = []

    // ── Messages ────────────────────────────────────
    addMessage(msg: Omit<MailboxMessage, 'id' | 'timestamp' | 'status'>): MailboxMessage {
        const message: MailboxMessage = {
            ...msg,
            id: nanoid(),
            timestamp: Date.now(),
            status: 'pending',
        }
        this.pendingMessages.push(message)
        return message
    }

    getMessagesFor(performerKey: string): MailboxMessage[] {
        return this.pendingMessages.filter(
            (m) => m.to === performerKey && m.status === 'pending',
        )
    }

    getAllPendingMessages(): MailboxMessage[] {
        return [...this.pendingMessages]
    }

    markDelivered(messageId: string): void {
        const idx = this.pendingMessages.findIndex((m) => m.id === messageId)
        if (idx !== -1) {
            // After delivery, message lives in performer's session — remove from mailbox
            this.pendingMessages.splice(idx, 1)
        }
    }

    // ── Board ───────────────────────────────────────

    postToBoard(entry: Omit<BoardEntry, 'id' | 'version' | 'timestamp'>): BoardEntry {
        const existing = this.board.get(entry.key)

        // writePolicy enforcement
        if (existing) {
            const wp = existing.writePolicy || 'any'
            if (wp === 'author-only' && existing.author !== entry.author) {
                throw new Error(
                    `Board key "${entry.key}" is author-only and owned by "${existing.author}".`,
                )
            }
            // relation-peers could be checked here with relation context (future)
        }

        const boardEntry: BoardEntry = {
            ...entry,
            id: existing?.id || nanoid(),
            version: existing ? existing.version + 1 : 1,
            timestamp: Date.now(),
        }

        if (existing && entry.updateMode === 'append') {
            boardEntry.content = existing.content + '\n' + entry.content
        }

        this.board.set(entry.key, boardEntry)
        return boardEntry
    }

    readBoard(key: string): BoardEntry | undefined {
        return this.board.get(key)
    }

    getBoardSnapshot(): BoardEntry[] {
        return Array.from(this.board.values())
    }

    getBoardMap(): Map<string, BoardEntry> {
        return new Map(this.board)
    }

    // ── WakeCondition ───────────────────────────────

    addWakeCondition(condition: Omit<WakeCondition, 'id' | 'status'>): WakeCondition {
        const wc: WakeCondition = {
            ...condition,
            id: nanoid(),
            status: 'waiting',
        }
        this.wakeConditions.push(wc)
        return wc
    }

    getWakeConditions(): WakeCondition[] {
        return this.wakeConditions.filter((c) => c.status === 'waiting')
    }

    /**
     * Evaluate all waiting conditions against an event.
     * Returns conditions that were triggered.
     */
    evaluateConditions(
        _event: MailboxEvent,
        evaluator: (condition: WakeCondition, board: Map<string, BoardEntry>, recentEvents: MailboxEvent[]) => boolean,
        recentEvents: MailboxEvent[],
    ): WakeCondition[] {
        const triggered: WakeCondition[] = []
        for (const cond of this.wakeConditions) {
            if (cond.status !== 'waiting') continue
            if (evaluator(cond, this.board, recentEvents)) {
                cond.status = 'triggered'
                triggered.push(cond)
            }
        }
        return triggered
    }

    removeCondition(conditionId: string): void {
        this.wakeConditions = this.wakeConditions.filter((c) => c.id !== conditionId)
    }

    // ── Lifecycle ───────────────────────────────────

    /**
     * Export the current state as a serializable object.
     */
    getState(): MailboxState {
        return {
            pendingMessages: [...this.pendingMessages],
            board: Object.fromEntries(this.board),
            wakeConditions: [...this.wakeConditions],
        }
    }

    /**
     * Restore state from a serialized object (e.g. after thread recovery).
     * Only board is restored — pending messages and wake conditions are transient.
     */
    restoreBoard(entries: BoardEntry[]): void {
        this.board.clear()
        for (const entry of entries) {
            this.board.set(entry.key, entry)
        }
    }

    /**
     * Shutdown: discard ephemeral state, return durable state.
     */
    shutdown(): { board: BoardEntry[] } {
        const durableBoard = this.getBoardSnapshot()
        this.pendingMessages = []
        this.wakeConditions = []
        return { board: durableBoard }
    }
}
