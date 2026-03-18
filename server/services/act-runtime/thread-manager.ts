/**
 * thread-manager.ts — Act Thread lifecycle management
 *
 * PRD §5: Thread is an execution instance of an Act.
 * Manages: creation, status transitions, performer session mapping, shutdown.
 */

import { nanoid } from 'nanoid'
import type { ActThread, ActThreadStatus, MailboxEvent, ActDefinition } from '../../../shared/act-types.js'
import { Mailbox } from './mailbox.js'
import { EventLogger } from './event-logger.js'
import { saveBoardToFile, loadBoardFromFile } from './board-persistence.js'

// ── Thread runtime state (in-memory) ────────────────────

interface ThreadRuntime {
    thread: ActThread
    mailbox: Mailbox
    eventLogger: EventLogger
    actDefinition?: ActDefinition  // stored from client on thread creation
}

// ── ThreadManager ───────────────────────────────────────

export class ThreadManager {
    private threads: Map<string, ThreadRuntime> = new Map()
    private readonly _workingDir: string

    constructor(workingDir: string) {
        this._workingDir = workingDir
    }

    // ── Thread CRUD ─────────────────────────────────

    createThread(actId: string, actDefinition?: ActDefinition): ActThread {
        const thread: ActThread = {
            id: nanoid(),
            actId,
            mailbox: {
                pendingMessages: [],
                board: {},
                wakeConditions: [],
            },
            performerSessions: {},
            createdAt: Date.now(),
            status: 'active',
        }

        const mailbox = new Mailbox()
        const eventLogger = new EventLogger(this._workingDir, actId, thread.id)

        this.threads.set(thread.id, { thread, mailbox, eventLogger, actDefinition })
        return thread
    }

    getThread(threadId: string): ActThread | null {
        const runtime = this.threads.get(threadId)
        if (!runtime) return null
        // Sync mailbox state snapshot into thread
        runtime.thread.mailbox = runtime.mailbox.getState()
        return runtime.thread
    }

    getThreadRuntime(threadId: string): ThreadRuntime | null {
        return this.threads.get(threadId) || null
    }

    listThreads(actId: string): ActThread[] {
        const results: ActThread[] = []
        for (const runtime of this.threads.values()) {
            if (runtime.thread.actId === actId) {
                runtime.thread.mailbox = runtime.mailbox.getState()
                results.push(runtime.thread)
            }
        }
        return results
    }

    /** Get the Act definition for a thread (stored from client on creation) */
    getActDefinition(threadId: string): ActDefinition | undefined {
        return this.threads.get(threadId)?.actDefinition
    }

    // ── Status transitions ──────────────────────────

    markActive(threadId: string): void {
        this.setThreadStatus(threadId, 'active')
    }

    markIdle(threadId: string): void {
        this.setThreadStatus(threadId, 'idle')
    }

    markCompleted(threadId: string): void {
        this.setThreadStatus(threadId, 'completed')
    }

    markInterrupted(threadId: string): void {
        this.setThreadStatus(threadId, 'interrupted')
    }

    private setThreadStatus(threadId: string, status: ActThreadStatus): void {
        const runtime = this.threads.get(threadId)
        if (runtime) {
            runtime.thread.status = status
        }
    }

    // ── Performer session mapping ───────────────────

    /**
     * Get or create a session ID for a performer within a thread.
     * Session creation is deferred to the caller — this just manages the mapping.
     */
    getOrCreateSession(threadId: string, performerKey: string, createSessionId: () => string): string {
        const runtime = this.threads.get(threadId)
        if (!runtime) throw new Error(`Thread ${threadId} not found`)

        const existing = runtime.thread.performerSessions[performerKey]
        if (existing) return existing

        const sessionId = createSessionId()
        runtime.thread.performerSessions[performerKey] = sessionId
        return sessionId
    }

    getPerformerSession(threadId: string, performerKey: string): string | null {
        const runtime = this.threads.get(threadId)
        if (!runtime) return null
        return runtime.thread.performerSessions[performerKey] || null
    }

    // ── Event logging ───────────────────────────────

    async logEvent(threadId: string, event: MailboxEvent): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        await runtime.eventLogger.appendEvent(event)
    }

    async getRecentEvents(threadId: string, count: number = 50): Promise<MailboxEvent[]> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return []
        return runtime.eventLogger.tailEvents(count)
    }

    // ── Board persistence ───────────────────────────

    async persistBoard(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        const entries = runtime.mailbox.getBoardSnapshot()
        await saveBoardToFile(
            this._workingDir,
            runtime.thread.actId,
            threadId,
            entries,
        )
    }

    async restoreBoard(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        const entries = await loadBoardFromFile(
            this._workingDir,
            runtime.thread.actId,
            threadId,
        )
        runtime.mailbox.restoreBoard(entries)
    }

    // ── Shutdown ─────────────────────────────────────

    /**
     * Shutdown a single thread: persist board, discard ephemeral state.
     */
    async shutdownThread(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return

        // Mark as interrupted if still running
        if (runtime.thread.status === 'active' || runtime.thread.status === 'idle') {
            runtime.thread.status = 'interrupted'
        }

        // Persist board before shutdown
        const { board } = runtime.mailbox.shutdown()
        await saveBoardToFile(
            this._workingDir,
            runtime.thread.actId,
            threadId,
            board,
        )
    }

    /**
     * Shutdown all active threads (server restart scenario).
     */
    async shutdownAllThreads(): Promise<void> {
        const promises: Promise<void>[] = []
        for (const [threadId, runtime] of this.threads) {
            if (runtime.thread.status === 'active' || runtime.thread.status === 'idle') {
                promises.push(this.shutdownThread(threadId))
            }
        }
        await Promise.all(promises)
    }

    /**
     * Get the number of active threads.
     */
    getActiveThreadCount(): number {
        let count = 0
        for (const runtime of this.threads.values()) {
            if (runtime.thread.status === 'active' || runtime.thread.status === 'idle') {
                count++
            }
        }
        return count
    }
}
