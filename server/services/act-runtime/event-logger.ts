/**
 * event-logger.ts — Append-only event log for Act Thread
 *
 * PRD §6.3: Events are stored as append-only .jsonl files.
 * Path: ~/.dot-studio/act-runtime/<actId>/<threadId>/events.jsonl
 */

import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { MailboxEvent } from '../../../shared/act-types.js'
import { STUDIO_DIR } from '../../lib/config.js'

// ── EventLogger ─────────────────────────────────────────

export class EventLogger {
    private readonly logPath: string
    private readonly _workingDir: string
    private readonly _actId: string
    private readonly _threadId: string

    constructor(workingDir: string, actId: string, threadId: string) {
        this._workingDir = workingDir
        this._actId = actId
        this._threadId = threadId
        this.logPath = join(
            STUDIO_DIR,
            'act-runtime',
            actId,
            threadId,
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
        } catch (err: any) {
            if (err.code === 'ENOENT') return []
            throw err
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
        } catch (err: any) {
            if (err.code === 'ENOENT') return []
            throw err
        }
    }

    /**
     * Get the file path for this event log.
     */
    getLogPath(): string {
        return this.logPath
    }

    get workingDir() { return this._workingDir }
    get actId() { return this._actId }
    get threadId() { return this._threadId }
}
