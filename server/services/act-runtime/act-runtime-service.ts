import { nanoid } from 'nanoid'
import type { ActDefinition, ConditionExpr, MailboxEvent } from '../../../shared/act-types.js'
import { SafetyGuard } from './safety-guard.js'
import { ThreadManager } from './thread-manager.js'
import { processWakeCascade } from './wake-cascade.js'

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
    kind: 'artifact' | 'fact' | 'task'
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

class ActRuntimeService {
    private readonly threadManager: ThreadManager
    private readonly safetyGuards = new Map<string, SafetyGuard>()

    constructor(workingDir: string) {
        this.threadManager = new ThreadManager(workingDir)
    }

    private getSafetyGuard(threadId: string): SafetyGuard {
        if (!this.safetyGuards.has(threadId)) {
            const actDef = this.threadManager.getActDefinition(threadId)
            this.safetyGuards.set(threadId, SafetyGuard.fromActSafety(actDef?.safety))
        }
        return this.safetyGuards.get(threadId)!
    }

    async sendMessage(threadId: string, body: SendMessageInput) {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const guard = this.getSafetyGuard(threadId)
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

        const event: MailboxEvent = {
            id: nanoid(),
            type: 'message.sent',
            sourceType: 'performer',
            source: body.from,
            timestamp: Date.now(),
            payload: { messageId: message.id, from: body.from, to: body.to, tag: body.tag, threadId },
        }
        await this.threadManager.logEvent(threadId, event)

        const budgetCheck = guard.checkEventBudget(event)
        if (!budgetCheck.ok) {
            return { ok: true as const, warning: budgetCheck.reason }
        }

        const actDefinition = this.threadManager.getActDefinition(threadId)
        const cascade = actDefinition
            ? await processWakeCascade(event, actDefinition, runtime.mailbox, this.threadManager, threadId)
            : null

        return { ok: true as const, messageId: message.id, cascade }
    }

    async postToBoard(threadId: string, body: PostToBoardInput) {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const guard = this.getSafetyGuard(threadId)
        const boardCheck = guard.checkBoardUpdateBudget(body.key)
        if (!boardCheck.ok) {
            return { ok: false as const, status: 429, error: boardCheck.reason }
        }

        try {
            const entry = runtime.mailbox.postToBoard({
                key: body.key,
                kind: body.kind,
                author: body.author,
                content: body.content,
                updateMode: body.updateMode || 'replace',
                ownership: 'authoritative',
                metadata: body.metadata,
                threadId,
            })

            await this.threadManager.persistBoard(threadId)

            const existing = runtime.mailbox.readBoard(body.key)
            const eventType = (existing?.version ?? 0) > 1 ? 'board.updated' : 'board.posted'
            const event: MailboxEvent = {
                id: nanoid(),
                type: eventType,
                sourceType: 'performer',
                source: body.author,
                timestamp: Date.now(),
                payload: { key: body.key, kind: body.kind, author: body.author, threadId },
            }
            await this.threadManager.logEvent(threadId, event)

            const actDefinition = this.threadManager.getActDefinition(threadId)
            const cascade = actDefinition
                ? await processWakeCascade(event, actDefinition, runtime.mailbox, this.threadManager, threadId)
                : null

            return { ok: true as const, entryId: entry.id, version: entry.version, cascade }
        } catch (error: unknown) {
            return { ok: false as const, status: 403, error: errorMessage(error) }
        }
    }

    readBoard(threadId: string, key?: string) {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        if (key) {
            const entry = runtime.mailbox.readBoard(key)
            return { ok: true as const, entries: entry ? [entry] : [] }
        }

        return { ok: true as const, entries: runtime.mailbox.getBoardSnapshot() }
    }

    setWakeCondition(threadId: string, body: SetWakeConditionInput) {
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

    createThread(actId: string, actDefinition?: ActDefinition) {
        const thread = this.threadManager.createThread(actId, actDefinition)
        return { ok: true as const, thread }
    }

    getActDefinition(threadId: string) {
        return this.threadManager.getActDefinition(threadId)
    }

    listThreads(actId: string) {
        return { ok: true as const, threads: this.threadManager.listThreads(actId) }
    }

    getThread(threadId: string) {
        const thread = this.threadManager.getThread(threadId)
        if (!thread) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }
        return { ok: true as const, thread }
    }

    async getRecentEvents(threadId: string, count = 50) {
        const events = await this.threadManager.getRecentEvents(threadId, count)
        return { ok: true as const, events }
    }
}

const runtimeServices = new Map<string, ActRuntimeService>()

export function getActRuntimeService(workingDir: string): ActRuntimeService {
    let service = runtimeServices.get(workingDir)
    if (!service) {
        service = new ActRuntimeService(workingDir)
        runtimeServices.set(workingDir, service)
    }
    return service
}

export function getActDefinitionForThread(workingDir: string, threadId: string) {
    return getActRuntimeService(workingDir).getActDefinition(threadId)
}
