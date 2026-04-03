/**
 * thread-manager.ts — Act Thread lifecycle management
 *
 * PRD §5: Thread is an execution instance of an Act.
 * Manages: creation, status transitions, participant session mapping, shutdown.
 *
 * Storage: ~/.dot-studio/workspaces/<workspaceId>/act-runtime/<actId>/<threadId>/
 *   - thread.json   — Thread metadata + mailbox state (WS5)
 *   - board.json    — Callboard entries
 *   - events.jsonl  — Append-only event log
 */

import { nanoid } from 'nanoid'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ActThread, ActThreadStatus, MailboxEvent, ActDefinition } from '../../../shared/act-types.js'
import type { SharedAssetRef } from '../../../shared/chat-contracts.js'
import { Mailbox } from './mailbox.js'
import { EventLogger } from './event-logger.js'
import { saveBoardToFile, loadBoardFromFile } from './board-persistence.js'
import { workspaceActRuntimeDir } from '../../lib/config.js'

// ── Thread runtime state ────────────────────────────────

interface ThreadRuntime {
    thread: ActThread
    mailbox: Mailbox
    eventLogger: EventLogger
    actDefinition?: ActDefinition
    retiredParticipantSessions: Record<string, string[]>
}

const THREAD_SNAPSHOT_SCHEMA_VERSION = 2

interface PersistedThreadState {
    id: string
    actId: string
    participantSessions: Record<string, string>
    retiredParticipantSessions: Record<string, string[]>
    createdAt: number
    status: ActThreadStatus
}

/** Serialized thread snapshot (thread.json) */
interface ThreadSnapshot {
    schemaVersion: 2
    thread: PersistedThreadState
    actDefinition?: ActDefinition
}

function sameSharedAssetRef(left: SharedAssetRef, right: SharedAssetRef) {
    if (left.kind !== right.kind) return false
    if (left.kind === 'draft' && right.kind === 'draft') {
        return left.draftId === right.draftId
    }
    if (left.kind === 'registry' && right.kind === 'registry') {
        return left.urn === right.urn
    }
    return false
}


// ── ThreadManager ───────────────────────────────────────

export class ThreadManager {
    private threads: Map<string, ThreadRuntime> = new Map()
    private readonly _workspaceId: string
    private readonly _workingDir: string

    constructor(workspaceId: string, workingDir: string) {
        this._workspaceId = workspaceId
        this._workingDir = workingDir
    }

    get workspaceId() { return this._workspaceId }
    get workingDir() { return this._workingDir }

    // ── Thread persistence (WS5) ────────────────────

    private threadJsonPath(actId: string, threadId: string): string {
        return join(workspaceActRuntimeDir(this._workspaceId, actId, threadId), 'thread.json')
    }

    private async persistThread(runtime: ThreadRuntime): Promise<void> {
        const filePath = this.threadJsonPath(runtime.thread.actId, runtime.thread.id)
        const dir = join(filePath, '..')
        await fs.mkdir(dir, { recursive: true })
        const snapshot: ThreadSnapshot = {
            schemaVersion: THREAD_SNAPSHOT_SCHEMA_VERSION,
            thread: {
                id: runtime.thread.id,
                actId: runtime.thread.actId,
                participantSessions: { ...runtime.thread.participantSessions },
                retiredParticipantSessions: Object.fromEntries(
                    Object.entries(runtime.retiredParticipantSessions).map(([key, sessionIds]) => [key, [...sessionIds]]),
                ),
                createdAt: runtime.thread.createdAt,
                status: runtime.thread.status,
            },
            actDefinition: runtime.actDefinition,
        }
        await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8')
    }

    /**
     * Load all persisted threads for a given Act (or all acts).
     * Called on startup or when accessing a workspace for the first time.
     */
    async loadPersistedThreads(actId?: string): Promise<void> {
        const { workspaceDir } = await import('../../lib/config.js')
        const runtimeRoot = join(workspaceDir(this._workspaceId), 'act-runtime')

        let actDirs: string[]
        try {
            actDirs = actId ? [actId] : await fs.readdir(runtimeRoot)
        } catch {
            return // no runtime dir yet
        }

        for (const act of actDirs) {
            const actDir = join(runtimeRoot, act)
            let threadDirs: string[]
            try {
                threadDirs = await fs.readdir(actDir)
            } catch {
                continue
            }

            for (const threadDir of threadDirs) {
                if (this.threads.has(threadDir)) continue // already loaded

                const threadJsonPath = join(actDir, threadDir, 'thread.json')
                try {
                    const raw = await fs.readFile(threadJsonPath, 'utf-8')
                    const snapshot = JSON.parse(raw) as Partial<ThreadSnapshot>
                    if (snapshot.schemaVersion !== THREAD_SNAPSHOT_SCHEMA_VERSION) {
                        await fs.rm(join(actDir, threadDir), { recursive: true, force: true })
                        continue
                    }
                    const mailbox = new Mailbox()
                    const persistedBoard = await loadBoardFromFile(this._workspaceId, act, threadDir)
                    mailbox.restoreBoard(persistedBoard)
                    const eventLogger = new EventLogger(this._workspaceId, act, threadDir)
                    const persistedThread = snapshot.thread
                    if (!persistedThread) {
                        await fs.rm(join(actDir, threadDir), { recursive: true, force: true })
                        continue
                    }
                    this.threads.set(threadDir, {
                        thread: {
                            id: persistedThread.id,
                            actId: persistedThread.actId,
                            mailbox: mailbox.getState(),
                            participantSessions: { ...(persistedThread.participantSessions || {}) },
                            createdAt: persistedThread.createdAt,
                            status: persistedThread.status,
                        },
                        mailbox,
                        eventLogger,
                        actDefinition: snapshot.actDefinition,
                        retiredParticipantSessions: { ...(persistedThread.retiredParticipantSessions || {}) },
                    })
                } catch {
                    // skip invalid/missing thread.json
                }
            }
        }
    }

    // ── Thread CRUD ─────────────────────────────────

    async createThread(actId: string, actDefinition?: ActDefinition): Promise<ActThread> {
        const thread: ActThread = {
            id: nanoid(),
            actId,
            mailbox: {
                pendingMessages: [],
                board: {},
                wakeConditions: [],
            },
            participantSessions: {},
            createdAt: Date.now(),
            status: 'active',
        }

        const mailbox = new Mailbox()
        const eventLogger = new EventLogger(this._workspaceId, actId, thread.id)

        const runtime: ThreadRuntime = {
            thread,
            mailbox,
            eventLogger,
            actDefinition,
            retiredParticipantSessions: {},
        }
        this.threads.set(thread.id, runtime)

        // WS5: persist immediately
        await this.persistThread(runtime)

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

    listThreadIds(actId: string, statuses?: ActThreadStatus[]): string[] {
        const allowed = statuses ? new Set(statuses) : null
        const ids: string[] = []
        for (const runtime of this.threads.values()) {
            if (runtime.thread.actId !== actId) continue
            if (allowed && !allowed.has(runtime.thread.status)) continue
            ids.push(runtime.thread.id)
        }
        return ids
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

    async deleteThread(threadId: string): Promise<boolean> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return false
        const actId = runtime.thread.actId
        this.threads.delete(threadId)
        // Remove persisted directory
        const dir = join(workspaceActRuntimeDir(this._workspaceId, actId, threadId))
        try {
            await fs.rm(dir, { recursive: true, force: true })
        } catch {
            // Ignore if already removed
        }
        return true
    }

    /** Get the Act definition for a thread (stored from client on creation) */
    getActDefinition(threadId: string): ActDefinition | undefined {
        return this.threads.get(threadId)?.actDefinition
    }

    // ── Status transitions ──────────────────────────

    async markActive(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'active')
    }

    async markIdle(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'idle')
    }

    async markCompleted(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'completed')
    }

    async markInterrupted(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'interrupted')
    }

    private async setThreadStatus(threadId: string, status: ActThreadStatus): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (runtime) {
            runtime.thread.status = status
            await this.persistThread(runtime)
        }
    }

    // ── Participant session mapping ─────────────────

    /**
     * Get or create a session ID for a participant within a thread.
     * Session creation is deferred to the caller — this just manages the mapping.
     */
    async getOrCreateSession(threadId: string, participantKey: string, createSessionId: () => string): Promise<string> {
        const runtime = this.threads.get(threadId)
        if (!runtime) throw new Error(`Thread ${threadId} not found`)

        const existing = runtime.thread.participantSessions[participantKey]
        if (existing) return existing

        const sessionId = createSessionId()
        runtime.thread.participantSessions[participantKey] = sessionId
        await this.persistThread(runtime)
        return sessionId
    }

    getPerformerSession(threadId: string, participantKey: string): string | null {
        const runtime = this.threads.get(threadId)
        if (!runtime) return null
        return runtime.thread.participantSessions[participantKey] || null
    }

    private retireParticipantSession(runtime: ThreadRuntime, participantKey: string, sessionId: string) {
        runtime.retiredParticipantSessions[participantKey] = [
            ...(runtime.retiredParticipantSessions[participantKey] || []),
            sessionId,
        ]
    }

    async syncThreadActDefinition(threadId: string, nextActDefinition: ActDefinition): Promise<boolean> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return false

        const previousParticipants = runtime.actDefinition?.participants || {}
        const nextParticipants = nextActDefinition.participants || {}
        const nextSessions = { ...runtime.thread.participantSessions }

        for (const [participantKey, sessionId] of Object.entries(runtime.thread.participantSessions)) {
            const previousBinding = previousParticipants[participantKey]
            const nextBinding = nextParticipants[participantKey]
            const removed = !nextBinding
            const performerChanged = !!previousBinding && !!nextBinding
                && !sameSharedAssetRef(previousBinding.performerRef, nextBinding.performerRef)

            if (removed || performerChanged) {
                this.retireParticipantSession(runtime, participantKey, sessionId)
                delete nextSessions[participantKey]
            }
        }

        runtime.thread.participantSessions = nextSessions
        runtime.actDefinition = nextActDefinition
        await this.persistThread(runtime)
        return true
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

    async getRecentEventsPage(threadId: string, count: number = 50, before = 0) {
        const runtime = this.threads.get(threadId)
        if (!runtime) {
            return {
                events: [],
                total: 0,
                hasMore: false,
                nextBefore: 0,
            }
        }
        return runtime.eventLogger.readRecentEventsPage(count, before)
    }

    // ── Board persistence ───────────────────────────

    async persistBoard(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        const entries = runtime.mailbox.getBoardSnapshot()
        await saveBoardToFile(
            this._workspaceId,
            runtime.thread.actId,
            threadId,
            entries,
        )
    }

    async restoreBoard(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        const entries = await loadBoardFromFile(
            this._workspaceId,
            runtime.thread.actId,
            threadId,
        )
        runtime.mailbox.restoreBoard(entries)
    }

    // ── Shutdown ─────────────────────────────────────

    /**
     * Shutdown a single thread: persist board + thread state, discard ephemeral state.
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
            this._workspaceId,
            runtime.thread.actId,
            threadId,
            board,
        )

        // Persist thread metadata
        await this.persistThread(runtime)
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
