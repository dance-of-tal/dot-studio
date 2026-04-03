/**
 * event-logger.ts — Append-only event log for Act Thread
 *
 * PRD §6.3: Events are stored as append-only .jsonl files.
 * Path: ~/.dot-studio/workspaces/<workspaceId>/act-runtime/<actId>/<threadId>/events.jsonl
 */

import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { MailboxEvent } from '../../../shared/act-types.js'
import { workspaceActRuntimeDir } from '../../lib/config.js'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

// ── EventLogger ─────────────────────────────────────────

export class EventLogger {
    private readonly logPath: string
    private readonly _workspaceId: string
    private readonly _actId: string
    private readonly _threadId: string

    constructor(workspaceId: string, actId: string, threadId: string) {
        this._workspaceId = workspaceId
        this._actId = actId
        this._threadId = threadId
        this.logPath = join(
            workspaceActRuntimeDir(workspaceId, actId, threadId),
            'events.jsonl',
        )
    }

    /**
     * Append an event to the log file.
     */
    async appendEvent(event: MailboxEvent): Promise<void> {
        await fs.mkdir(dirname(this.logPath), { recursive: true })
        const line = JSON.stringify(event) + '\n'
        await fs.appendFile(this.logPath, line, 'utf-8')
    }

    /**
     * Read the last N events from the log (for UI Activity View).
     */
    async tailEvents(count: number): Promise<MailboxEvent[]> {
        try {
            const content = await fs.readFile(this.logPath, 'utf-8')
            const lines = content.trim().split('\n').filter(Boolean)
            const tail = lines.slice(-count)
            return tail.map((line) => JSON.parse(line) as MailboxEvent)
        } catch (error: unknown) {
            if (isErrnoException(error) && error.code === 'ENOENT') return []
            throw error
        }
    }

    async readRecentEventsPage(count: number, before = 0): Promise<{
        events: MailboxEvent[]
        total: number
        hasMore: boolean
        nextBefore: number
    }> {
        try {
            const content = await fs.readFile(this.logPath, 'utf-8')
            const lines = content.trim().split('\n').filter(Boolean)
            const total = lines.length
            const normalizedBefore = Math.max(0, Math.min(total, Math.floor(before)))
            const end = Math.max(0, total - normalizedBefore)
            const start = Math.max(0, end - Math.max(1, Math.floor(count)))
            const events = lines.slice(start, end).map((line) => JSON.parse(line) as MailboxEvent)
            const nextBefore = normalizedBefore + events.length
            return {
                events,
                total,
                hasMore: nextBefore < total,
                nextBefore,
            }
        } catch (error: unknown) {
            if (isErrnoException(error) && error.code === 'ENOENT') {
                return {
                    events: [],
                    total: 0,
                    hasMore: false,
                    nextBefore: 0,
                }
            }
            throw error
        }
    }

    /**
     * Read all events from the log.
     */
    async readAllEvents(): Promise<MailboxEvent[]> {
        try {
            const content = await fs.readFile(this.logPath, 'utf-8')
            const lines = content.trim().split('\n').filter(Boolean)
            return lines.map((line) => JSON.parse(line) as MailboxEvent)
        } catch (error: unknown) {
            if (isErrnoException(error) && error.code === 'ENOENT') return []
            throw error
        }
    }

    /**
     * Get the file path for this event log.
     */
    getLogPath(): string {
        return this.logPath
    }

    get workspaceId() { return this._workspaceId }
    get actId() { return this._actId }
    get threadId() { return this._threadId }
}
