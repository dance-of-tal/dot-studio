import { nanoid } from 'nanoid'
import type { ActDefinition, ConditionExpr, MailboxEvent } from '../../../shared/act-types.js'
import { SafetyGuard } from './safety-guard.js'
import { ThreadManager } from './thread-manager.js'
import {
    clearParticipantCircuit,
    clearParticipantQueueRunning,
    drainParticipantQueueAfterSettlement,
    markParticipantQueueRunning,
    processWakeCascade,
    tripParticipantCircuit,
} from './wake-cascade.js'
import { workspaceIdForDir } from '../../lib/config.js'

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

type SendMessageInput = {
    from: string
    to: string
    content: string
    tag?: string
}

type PostToBoardInput = {
    author: string
    key: string
    kind: 'artifact' | 'finding' | 'task'
    content: string
    updateMode?: 'replace' | 'append'
    metadata?: Record<string, unknown>
}

type SetWakeConditionInput = {
    createdBy: string
    target: 'self'
    onSatisfiedMessage: string
    condition: ConditionExpr
}

type ReadBoardInput = {
    key?: string
    limit?: number
    summaryOnly?: boolean
}

const BOARD_ENTRY_MAX_CHARS = 4000
const BOARD_APPEND_MAX_CHARS = 600
const BOARD_SUMMARY_MAX_CHARS = 280
const BOARD_READ_LIMIT_DEFAULT = 8
const BOARD_READ_LIMIT_MAX = 25

function normalizeBoardReadLimit(limit?: number) {
    if (!Number.isFinite(limit)) return BOARD_READ_LIMIT_DEFAULT
    return Math.max(1, Math.min(BOARD_READ_LIMIT_MAX, Math.floor(limit || BOARD_READ_LIMIT_DEFAULT)))
}

function summarizeBoardEntry<T extends { content: string }>(entry: T): T {
    if (entry.content.length <= BOARD_SUMMARY_MAX_CHARS) {
        return entry
    }
    return {
        ...entry,
        content: `${entry.content.slice(0, BOARD_SUMMARY_MAX_CHARS)}…`,
    }
}

class ActRuntimeService {
    private readonly threadManager: ThreadManager
    private readonly workingDir: string
    private readonly safetyGuards = new Map<string, SafetyGuard>()
    private _threadsLoaded = false

    constructor(workspaceId: string, workingDir: string) {
        this.workingDir = workingDir
        this.threadManager = new ThreadManager(workspaceId, workingDir)
    }

    /** Lazy-load persisted threads on first access */
    private async ensureThreadsLoaded(): Promise<void> {
        if (this._threadsLoaded) return
        this._threadsLoaded = true
        console.log(`[act-runtime] Loading persisted threads for workspace ${this.workingDir}`)
        await this.threadManager.loadPersistedThreads()
        console.log(`[act-runtime] Loaded ${this.threadManager.getActiveThreadCount()} threads`)
    }

    private getSafetyGuard(threadId: string): SafetyGuard {
        if (!this.safetyGuards.has(threadId)) {
            const actDef = this.threadManager.getActDefinition(threadId)
            this.safetyGuards.set(threadId, SafetyGuard.fromActSafety(actDef?.safety))
        }
        return this.safetyGuards.get(threadId)!
    }

    async sendMessage(threadId: string, body: SendMessageInput) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            console.error(`[act-runtime] sendMessage: Thread ${threadId} not found. workingDir=${this.workingDir}`)
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const guard = this.getSafetyGuard(threadId)

        // Thread timeout check (PRD §16.3)
        const timeoutCheck = guard.checkTimeout(runtime.thread)
        if (!timeoutCheck.ok) {
            return { ok: false as const, status: 429, error: timeoutCheck.reason }
        }

        // Event budget check BEFORE message is added (PRD §16.1)
        const preEvent: MailboxEvent = {
            id: nanoid(),
            type: 'message.sent',
            sourceType: 'performer',
            source: body.from,
            timestamp: Date.now(),
            payload: { from: body.from, to: body.to, tag: body.tag, threadId },
        }
        const budgetCheck = guard.checkEventBudget(preEvent)
        if (!budgetCheck.ok) {
            return { ok: false as const, status: 429, error: budgetCheck.reason }
        }

        // Relation permission check (PRD §16.5)
        const actDefinition = this.threadManager.getActDefinition(threadId)
        if (actDefinition) {
            const permCheck = guard.checkPermission(body.from, body.to, actDefinition.relations)
            if (!permCheck.ok) {
                return { ok: false as const, status: 403, error: permCheck.reason }
            }
        }

        const pairCheck = guard.checkPairBudget(body.from, body.to)
        if (!pairCheck.ok) {
            return { ok: false as const, status: 429, error: pairCheck.reason }
        }

        const loopCheck = guard.checkLoopDetection(body.from, body.to)
        if (!loopCheck.ok) {
            return { ok: false as const, status: 429, error: loopCheck.reason }
        }

        const message = runtime.mailbox.addMessage({
            from: body.from,
            to: body.to,
            content: body.content,
            tag: body.tag,
            threadId,
        })

        // Update event with messageId and log
        preEvent.payload = { messageId: message.id, from: body.from, to: body.to, tag: body.tag, threadId }
        await this.threadManager.logEvent(threadId, preEvent)

        // Fire-and-forget: don't block the tool call response
        if (actDefinition) {
            processWakeCascade(preEvent, actDefinition, runtime.mailbox, this.threadManager, threadId, this.workingDir)
                .then((cascadeResult) => this.maybeEmitRuntimeIdle(threadId, cascadeResult, actDefinition, runtime.mailbox))
                .catch((err) => console.error('[act-runtime] Wake cascade error (sendMessage):', err))
        }

        return { ok: true as const, messageId: message.id }
    }

    async postToBoard(threadId: string, body: PostToBoardInput) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const guard = this.getSafetyGuard(threadId)

        // Thread timeout check (PRD §16.3)
        const timeoutCheck = guard.checkTimeout(runtime.thread)
        if (!timeoutCheck.ok) {
            return { ok: false as const, status: 429, error: timeoutCheck.reason }
        }

        const key = body.key.trim()
        const content = body.content.trim()
        const updateMode = body.updateMode || 'replace'
        if (!key) {
            return { ok: false as const, status: 400, error: 'Shared note key is required' }
        }
        if (!content) {
            return { ok: false as const, status: 400, error: 'Shared note content is required' }
        }

        const boardCheck = guard.checkBoardUpdateBudget(key)
        if (!boardCheck.ok) {
            return { ok: false as const, status: 429, error: boardCheck.reason }
        }

        // Board writePolicy check (PRD §16.6)
        const existingEntry = runtime.mailbox.readBoard(key)
        if (existingEntry) {
            const wpCheck = guard.checkBoardWritePolicy(existingEntry, body.author)
            if (!wpCheck.ok) {
                return { ok: false as const, status: 403, error: wpCheck.reason }
            }
        }

        if (content.length > BOARD_ENTRY_MAX_CHARS) {
            return { ok: false as const, status: 400, error: `Shared note content must be ${BOARD_ENTRY_MAX_CHARS} characters or less` }
        }
        if (updateMode === 'append') {
            if (content.length > BOARD_APPEND_MAX_CHARS) {
                return { ok: false as const, status: 400, error: `Append updates must be ${BOARD_APPEND_MAX_CHARS} characters or less` }
            }
            if (existingEntry && `${existingEntry.content}\n${content}`.length > BOARD_ENTRY_MAX_CHARS) {
                return { ok: false as const, status: 400, error: 'Append update would exceed the shared note size limit. Replace the entry with a compact summary instead.' }
            }
        }

        try {
            const entry = runtime.mailbox.postToBoard({
                key,
                kind: body.kind,
                author: body.author,
                content,
                updateMode,
                ownership: 'authoritative',
                metadata: body.metadata,
                threadId,
            })

            await this.threadManager.persistBoard(threadId)

            const eventType = entry.version > 1 ? 'board.updated' : 'board.posted'
            const event: MailboxEvent = {
                id: nanoid(),
                type: eventType,
                sourceType: 'performer',
                source: body.author,
                timestamp: Date.now(),
                payload: { key, kind: body.kind, author: body.author, threadId },
            }
            await this.threadManager.logEvent(threadId, event)

            const actDefinition = this.threadManager.getActDefinition(threadId)
            // Fire-and-forget: don't block the tool call response
            if (actDefinition) {
                processWakeCascade(event, actDefinition, runtime.mailbox, this.threadManager, threadId, this.workingDir)
                    .then((cascadeResult) => this.maybeEmitRuntimeIdle(threadId, cascadeResult, actDefinition, runtime.mailbox))
                    .catch((err) => console.error('[act-runtime] Wake cascade error (postToBoard):', err))
            }

            return { ok: true as const, entryId: entry.id, version: entry.version }
        } catch (error: unknown) {
            return { ok: false as const, status: 403, error: errorMessage(error) }
        }
    }

    async readBoard(threadId: string, input: ReadBoardInput = {}) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const key = input.key?.trim()
        if (key) {
            const entry = runtime.mailbox.readBoard(key)
            return { ok: true as const, entries: entry ? [entry] : [] }
        }

        const entries = runtime.mailbox.getBoardSnapshot()
            .sort((left, right) => right.timestamp - left.timestamp)
            .slice(0, normalizeBoardReadLimit(input.limit))
        return {
            ok: true as const,
            entries: input.summaryOnly === false ? entries : entries.map((entry) => summarizeBoardEntry(entry)),
        }
    }

    async syncActDefinition(actId: string, actDefinition: ActDefinition) {
        await this.ensureThreadsLoaded()
        const threadIds = this.threadManager.listThreadIds(actId, ['active', 'idle'])

        for (const threadId of threadIds) {
            const synced = await this.threadManager.syncThreadActDefinition(threadId, actDefinition)
            if (!synced) continue

            this.safetyGuards.delete(threadId)

            const event: MailboxEvent = {
                id: nanoid(),
                type: 'runtime.reconfigured',
                sourceType: 'system',
                source: 'studio',
                timestamp: Date.now(),
                payload: {
                    actId,
                    threadId,
                    participantCount: Object.keys(actDefinition.participants || {}).length,
                    relationCount: actDefinition.relations.length,
                },
            }
            await this.threadManager.logEvent(threadId, event)
        }

        return { ok: true as const, threads: this.threadManager.listThreads(actId) }
    }

    async setWakeCondition(threadId: string, body: SetWakeConditionInput) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const wakeCondition = runtime.mailbox.addWakeCondition({
            target: body.target,
            createdBy: body.createdBy,
            onSatisfiedMessage: body.onSatisfiedMessage,
            condition: body.condition,
        })

        return { ok: true as const, conditionId: wakeCondition.id }
    }

    async createThread(actId: string, actDefinition?: ActDefinition) {
        const thread = await this.threadManager.createThread(actId, actDefinition)
        return { ok: true as const, thread }
    }

    async getActDefinition(threadId: string) {
        await this.ensureThreadsLoaded()
        return this.threadManager.getActDefinition(threadId)
    }

    async listThreads(actId: string) {
        await this.ensureThreadsLoaded()
        return { ok: true as const, threads: this.threadManager.listThreads(actId) }
    }

    async deleteThread(_actId: string, threadId: string) {
        const deleted = await this.threadManager.deleteThread(threadId)
        if (!deleted) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }
        return { ok: true as const }
    }

    async getThread(threadId: string) {
        await this.ensureThreadsLoaded()
        const thread = this.threadManager.getThread(threadId)
        if (!thread) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }
        return { ok: true as const, thread }
    }

    async getRecentEvents(threadId: string, count = 50) {
        await this.ensureThreadsLoaded()
        const events = await this.threadManager.getRecentEvents(threadId, count)
        return { ok: true as const, events }
    }

    async registerParticipantSession(threadId: string, participantKey: string, sessionId: string) {
        await this.ensureThreadsLoaded()
        await this.threadManager.getOrCreateSession(threadId, participantKey, () => sessionId)
    }

    async beginUserTurn(threadId: string) {
        await this.ensureThreadsLoaded()
        this.getSafetyGuard(threadId).reset(Date.now())
    }

    async markParticipantSessionBusy(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        markParticipantQueueRunning(threadId, participantKey)
    }

    async clearParticipantSessionBusy(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        clearParticipantQueueRunning(threadId, participantKey)
    }

    async tripParticipantAutoWakeCircuit(threadId: string, participantKey: string, reason: string) {
        await this.ensureThreadsLoaded()
        tripParticipantCircuit(threadId, participantKey, reason)
    }

    async clearParticipantAutoWakeCircuit(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        clearParticipantCircuit(threadId, participantKey)
    }

    async drainParticipantQueue(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        const actDefinition = this.threadManager.getActDefinition(threadId)
        if (!runtime || !actDefinition) {
            return
        }
        await drainParticipantQueueAfterSettlement(
            participantKey,
            actDefinition,
            runtime.mailbox,
            this.threadManager,
            threadId,
            this.workingDir,
        )
    }

    /**
     * Emit runtime.idle event when a wake cascade completes with no errors
     * and no queued targets remaining. Participants subscribed to 'runtime.idle'
     * will be woken by this event.
     */
    private async maybeEmitRuntimeIdle(
        threadId: string,
        cascadeResult: import('./wake-cascade.js').WakeCascadeResult,
        actDefinition: ActDefinition,
        mailbox: import('./mailbox.js').Mailbox,
    ): Promise<void> {
        // Only emit if cascade had targets but no errors, and queue is empty
        if (cascadeResult.errors.length > 0) return
        if (cascadeResult.injected.length === 0 && cascadeResult.queued.length === 0) return

        const idleEvent: MailboxEvent = {
            id: nanoid(),
            type: 'runtime.idle',
            sourceType: 'system',
            source: 'runtime',
            timestamp: Date.now(),
            payload: {
                threadId,
                injectedCount: cascadeResult.injected.length,
            },
        }
        await this.threadManager.logEvent(threadId, idleEvent)

        // Route the idle event — but don't recurse further to avoid infinite loops
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (runtime) {
            processWakeCascade(idleEvent, actDefinition, mailbox, this.threadManager, threadId, this.workingDir)
                .catch((err) => console.error('[act-runtime] Wake cascade error (runtime.idle):', err))
        }
    }
}

const runtimeServices = new Map<string, ActRuntimeService>()

export function getActRuntimeService(workingDir: string): ActRuntimeService {
    const workspaceId = workspaceIdForDir(workingDir)
    let service = runtimeServices.get(workspaceId)
    if (!service) {
        service = new ActRuntimeService(workspaceId, workingDir)
        runtimeServices.set(workspaceId, service)
    }
    return service
}

export async function getActDefinitionForThread(workingDir: string, threadId: string) {
    return getActRuntimeService(workingDir).getActDefinition(threadId)
}
