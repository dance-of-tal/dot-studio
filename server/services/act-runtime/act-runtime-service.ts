import { nanoid } from 'nanoid'
import type {
    ActDefinition,
    ConditionExpr,
    MailboxEvent,
    ActThreadSummary,
    WakeCondition,
    ParticipantSubscriptions,
    ActRelation,
} from '../../../shared/act-types.js'
import { SafetyGuard } from './safety-guard.js'
import { ThreadManager } from './thread-manager.js'
import {
    BLOCKED_PROJECTION_RETRY_MESSAGE,
    clearParticipantCircuit,
    clearParticipantQueueRunning,
    drainParticipantQueueAfterSettlement,
    markParticipantQueueRunning,
    processWakeCascade,
    processWakeTargets,
    tripParticipantCircuit,
} from './wake-cascade.js'
import { workspaceIdForDir } from '../../lib/config.js'
import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { serverDebug } from '../../lib/server-logger.js'
import {
    isSessionStatusActive,
    resolveEffectiveSessionStatus,
} from '../../lib/chat-session.js'
import { evaluateWakeCondition } from './wake-evaluator.js'
import { validateConditionExpr } from './wake-condition-validator.js'
import { payloadString } from './act-runtime-utils.js'
import type { WakeUpTarget } from './event-router.js'

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

const MAX_WAKE_CONDITION_ALARM_DELAY_MS = 2_147_483_647

function matchCallboardKey(patterns: string[] | undefined, key: string | undefined) {
    if (!key || !patterns?.length) {
        return false
    }

    return patterns.some((pattern) => {
        if (pattern.endsWith('*')) {
            return key.startsWith(pattern.slice(0, -1))
        }
        return key === pattern
    })
}

function hasRelationPermission(
    participantKey: string,
    source: string,
    relations: ActRelation[],
) {
    if (!source || source === participantKey) {
        return false
    }

    return relations.some((relation) => {
        const [left, right] = relation.between
        const pairMatch = (left === source && right === participantKey) || (left === participantKey && right === source)
        if (!pairMatch) {
            return false
        }
        if (relation.direction === 'one-way') {
            return left === source && right === participantKey
        }
        return true
    })
}

function matchesParticipantSubscription(
    participantKey: string,
    subscriptions: ParticipantSubscriptions | undefined,
    event: MailboxEvent,
) {
    if (!subscriptions) {
        return false
    }

    switch (event.type) {
        case 'message.sent':
        case 'message.delivered': {
            if (payloadString(event.payload, 'to') !== participantKey) {
                return false
            }
            const from = payloadString(event.payload, 'from')
            const tag = payloadString(event.payload, 'tag')
            return (subscriptions.messagesFrom?.includes(from || '') ?? false)
                || (subscriptions.messageTags?.includes(tag || '') ?? false)
        }
        case 'board.posted':
        case 'board.updated':
            return matchCallboardKey(subscriptions.callboardKeys, payloadString(event.payload, 'key'))
        case 'runtime.idle':
            return subscriptions.eventTypes?.includes('runtime.idle') ?? false
        default:
            return false
    }
}

function buildRecoverableWakeTarget(params: {
    participantKey: string
    actDefinition: ActDefinition
    threadId: string
    recentEvents: MailboxEvent[]
    updatedAt?: number
    triggeredCondition?: WakeCondition | null
}) {
    const {
        participantKey,
        actDefinition,
        threadId,
        recentEvents,
        updatedAt,
        triggeredCondition,
    } = params

    if (triggeredCondition) {
        return {
            participantKey,
            reason: 'wake-condition',
            wakeCondition: triggeredCondition,
            triggerEvent: {
                id: nanoid(),
                type: 'runtime.idle',
                sourceType: 'system',
                source: 'wait_until',
                timestamp: Date.now(),
                payload: { threadId, conditionId: triggeredCondition.id },
            },
        } satisfies WakeUpTarget
    }

    const candidateEvents = recentEvents
        .filter((event) => typeof updatedAt !== 'number' || event.timestamp <= updatedAt)
        .reverse()

    for (const event of candidateEvents) {
        if (event.source === participantKey) {
            continue
        }

        const relationAllowed = hasRelationPermission(participantKey, event.source, actDefinition.relations)
        if (!relationAllowed) {
            continue
        }

        if ((event.type === 'message.sent' || event.type === 'message.delivered')
            && payloadString(event.payload, 'to') === participantKey) {
            return {
                participantKey,
                triggerEvent: event,
                reason: 'subscription',
            } satisfies WakeUpTarget
        }

        const subscriptions = actDefinition.participants[participantKey]?.subscriptions
        if (matchesParticipantSubscription(participantKey, subscriptions, event)) {
            return {
                participantKey,
                triggerEvent: event,
                reason: 'subscription',
            } satisfies WakeUpTarget
        }
    }

    return null
}

function nextWakeConditionAlarmAt(condition: ConditionExpr, now: number): number | null {
    switch (condition.type) {
        case 'wake_at':
            return condition.at > now ? condition.at : null
        case 'all_of':
        case 'any_of': {
            const candidates = condition.conditions
                .map((sub) => nextWakeConditionAlarmAt(sub, now))
                .filter((value): value is number => typeof value === 'number')
                .sort((left, right) => left - right)
            return candidates[0] ?? null
        }
        default:
            return null
    }
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

type OpenCodeSessionStatus = {
    type?: 'idle' | 'busy' | 'retry' | 'error'
} & Record<string, unknown>

type OpenCodeSessionMessage = {
    info?: {
        role?: string
        error?: unknown
        time?: {
            completed?: number
        }
    }
    role?: string
    parts?: unknown[]
} & Record<string, unknown>

type ListBoardInput = {
    kind?: 'artifact' | 'finding' | 'task'
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
    private readonly wakeConditionAlarms = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly blockedWakeRecoveryInFlight = new Set<string>()
    private _threadsLoaded = false

    constructor(workspaceId: string, workingDir: string) {
        this.workingDir = workingDir
        this.threadManager = new ThreadManager(workspaceId, workingDir)
    }

    /** Lazy-load persisted threads on first access */
    private async ensureThreadsLoaded(): Promise<void> {
        if (this._threadsLoaded) return
        this._threadsLoaded = true
        serverDebug('act-runtime', `Loading persisted threads for workspace ${this.workingDir}`)
        await this.threadManager.loadPersistedThreads()
        await this.recoverLoadedThreadRuntimeState()
        serverDebug('act-runtime', `Loaded ${this.threadManager.getActiveThreadCount()} threads`)
    }

    private async recoverLoadedThreadRuntimeState() {
        await this.reconcileLoadedParticipantStatuses()

        for (const threadId of this.threadManager.listLoadedThreadIds()) {
            const runtime = this.threadManager.getThreadRuntime(threadId)
            const actDefinition = this.threadManager.getActDefinition(threadId)
            if (!runtime || !actDefinition) {
                continue
            }

            const recentEvents = await this.threadManager.getRecentEvents(threadId, 50)

            for (const condition of runtime.mailbox.getWakeConditions()) {
                if (evaluateWakeCondition(condition, runtime.mailbox.getBoardMap(), recentEvents, actDefinition)) {
                    condition.status = 'triggered'
                    await processWakeTargets(
                        [{
                            participantKey: condition.createdBy,
                            triggerEvent: {
                                id: nanoid(),
                                type: 'runtime.idle',
                                sourceType: 'system',
                                source: 'wait_until',
                                timestamp: Date.now(),
                                payload: { threadId, conditionId: condition.id },
                            },
                            wakeCondition: condition,
                            reason: 'wake-condition',
                        }],
                        actDefinition,
                        runtime.mailbox,
                        this.threadManager,
                        threadId,
                        this.workingDir,
                    )
                    continue
                }

                this.scheduleWakeConditionAlarm(threadId, condition)
            }

            for (const [participantKey, status] of Object.entries(runtime.thread.participantStatuses || {})) {
                if (status.type !== 'retry' || status.message !== BLOCKED_PROJECTION_RETRY_MESSAGE) {
                    continue
                }
                await this.recoverBlockedParticipantWake({
                    threadId,
                    participantKey,
                    statusUpdatedAt: status.updatedAt,
                    actDefinition,
                    recentEvents,
                })
            }
        }
    }

    private async reconcileLoadedParticipantStatuses() {
        const oc = await getOpencode()
        let statuses: Record<string, OpenCodeSessionStatus> = {}

        try {
            statuses = unwrapOpencodeResult<Record<string, OpenCodeSessionStatus>>(await oc.session.status({
                directory: this.workingDir,
            })) || {}
        } catch {
            statuses = {}
        }

        for (const threadId of this.threadManager.listLoadedThreadIds()) {
            const runtime = this.threadManager.getThreadRuntime(threadId)
            if (!runtime) {
                continue
            }

            for (const [participantKey, sessionId] of Object.entries(runtime.thread.participantSessions || {})) {
                const persistedStatus = runtime.thread.participantStatuses?.[participantKey]
                if (persistedStatus?.type !== 'busy' && persistedStatus?.type !== 'retry') {
                    continue
                }

                const reconciled = await this.resolveLoadedParticipantSessionStatus(oc, statuses, sessionId)
                if (!reconciled || reconciled.type === persistedStatus.type) {
                    continue
                }

                serverDebug(
                    'act-runtime',
                    `Reconciled stale participant status for "${participantKey}" in thread ${threadId}: ${persistedStatus.type} -> ${reconciled.type}`,
                )
                await this.threadManager.setParticipantStatus(threadId, participantKey, reconciled)
            }
        }
    }

    private async resolveLoadedParticipantSessionStatus(
        oc: Awaited<ReturnType<typeof getOpencode>>,
        statuses: Record<string, OpenCodeSessionStatus>,
        sessionId: string,
    ): Promise<{ type: 'idle' | 'busy' | 'retry' | 'error'; message?: string } | null> {
        const direct = statuses[sessionId]
        if (direct?.type === 'idle' || direct?.type === 'error') {
            return { type: direct.type }
        }

        const shouldInspectMessages = !direct?.type || isSessionStatusActive(direct)
        if (!shouldInspectMessages) {
            return direct?.type ? { type: direct.type } : null
        }

        try {
            const rawMessages = unwrapOpencodeResult<OpenCodeSessionMessage[]>(await oc.session.messages({
                directory: this.workingDir,
                sessionID: sessionId,
            })) || []
            const effectiveStatus = resolveEffectiveSessionStatus({
                directStatus: direct,
                messages: rawMessages,
            })
            return effectiveStatus?.type ? { type: effectiveStatus.type } : null
        } catch {
            // If message inspection fails, keep the authoritative direct status.
        }

        return direct?.type ? { type: direct.type } : null
    }

    private async recoverBlockedParticipantWake(params: {
        threadId: string
        participantKey: string
        statusUpdatedAt?: number
        actDefinition: ActDefinition
        recentEvents: MailboxEvent[]
    }) {
        const {
            threadId,
            participantKey,
            statusUpdatedAt,
            actDefinition,
            recentEvents,
        } = params
        const recoveryKey = `${threadId}:${participantKey}`
        if (this.blockedWakeRecoveryInFlight.has(recoveryKey)) {
            return
        }

        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return
        }

        const triggeredCondition = runtime.mailbox.getWakeConditionsForParticipant(participantKey, {
            statuses: ['triggered'],
        })[0] || null
        const target = buildRecoverableWakeTarget({
            participantKey,
            actDefinition,
            threadId,
            recentEvents,
            updatedAt: statusUpdatedAt,
            triggeredCondition,
        })
        if (!target) {
            return
        }

        this.blockedWakeRecoveryInFlight.add(recoveryKey)
        try {
            await processWakeTargets(
                [target],
                actDefinition,
                runtime.mailbox,
                this.threadManager,
                threadId,
                this.workingDir,
            )
        } finally {
            this.blockedWakeRecoveryInFlight.delete(recoveryKey)
        }
    }

    private getSafetyGuard(threadId: string): SafetyGuard {
        if (!this.safetyGuards.has(threadId)) {
            const actDef = this.threadManager.getActDefinition(threadId)
            this.safetyGuards.set(threadId, SafetyGuard.fromActSafety(actDef?.safety))
        }
        return this.safetyGuards.get(threadId)!
    }

    private wakeConditionAlarmKey(threadId: string, conditionId: string) {
        return `${threadId}:${conditionId}`
    }

    private clearWakeConditionAlarm(threadId: string, conditionId: string) {
        const alarmKey = this.wakeConditionAlarmKey(threadId, conditionId)
        const alarm = this.wakeConditionAlarms.get(alarmKey)
        if (alarm) {
            clearTimeout(alarm)
            this.wakeConditionAlarms.delete(alarmKey)
        }
    }

    private clearThreadWakeConditionAlarms(threadId: string) {
        for (const alarmKey of Array.from(this.wakeConditionAlarms.keys())) {
            if (!alarmKey.startsWith(`${threadId}:`)) {
                continue
            }
            const alarm = this.wakeConditionAlarms.get(alarmKey)
            if (alarm) {
                clearTimeout(alarm)
            }
            this.wakeConditionAlarms.delete(alarmKey)
        }
    }

    private scheduleWakeConditionAlarm(threadId: string, condition: WakeCondition) {
        this.clearWakeConditionAlarm(threadId, condition.id)
        if (condition.status !== 'waiting') {
            return
        }

        const nextAt = nextWakeConditionAlarmAt(condition.condition, Date.now())
        if (typeof nextAt !== 'number') {
            return
        }

        const delay = Math.max(0, Math.min(nextAt - Date.now(), MAX_WAKE_CONDITION_ALARM_DELAY_MS))
        const alarm = setTimeout(() => {
            this.wakeConditionAlarms.delete(this.wakeConditionAlarmKey(threadId, condition.id))
            void this.handleWakeConditionAlarm(threadId, condition).catch((error) => {
                console.error('[act-runtime] Wake condition alarm error:', error)
            })
        }, delay)
        this.wakeConditionAlarms.set(this.wakeConditionAlarmKey(threadId, condition.id), alarm)
    }

    private async handleWakeConditionAlarm(threadId: string, condition: WakeCondition) {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        const actDefinition = this.threadManager.getActDefinition(threadId)
        if (!runtime || !actDefinition || condition.status !== 'waiting') {
            return
        }

        const recentEvents = await this.threadManager.getRecentEvents(threadId, 20)
        if (!evaluateWakeCondition(condition, runtime.mailbox.getBoardMap(), recentEvents, actDefinition)) {
            this.scheduleWakeConditionAlarm(threadId, condition)
            return
        }

        condition.status = 'triggered'
        await processWakeTargets(
            [{
                participantKey: condition.createdBy,
                triggerEvent: {
                    id: nanoid(),
                    type: 'runtime.idle',
                    sourceType: 'system',
                    source: 'wait_until',
                    timestamp: Date.now(),
                    payload: { threadId, conditionId: condition.id },
                },
                wakeCondition: condition,
                reason: 'wake-condition',
            }],
            actDefinition,
            runtime.mailbox,
            this.threadManager,
            threadId,
            this.workingDir,
        )
    }

    private async prewarmActParticipantProjections(actDefinition?: ActDefinition): Promise<void> {
        if (!actDefinition) {
            return
        }

        const { ensurePerformerProjection } = await import('../opencode-projection/stage-projection-service.js')
        const { resolvePerformerForWake } = await import('./wake-performer-resolver.js')
        const { ensureActToolFiles } = await import('./act-tool-files.js')

        for (const participantKey of Object.keys(actDefinition.participants || {})) {
            try {
                const performerConfig = await resolvePerformerForWake(
                    this.workingDir,
                    actDefinition,
                    participantKey,
                )
                if (!performerConfig?.model) {
                    continue
                }

                await ensurePerformerProjection({
                    performerId: performerConfig.performerId,
                    performerName: performerConfig.performerName,
                    talRef: performerConfig.talRef,
                    danceRefs: performerConfig.danceRefs,
                    model: performerConfig.model,
                    modelVariant: performerConfig.modelVariant,
                    mcpServerNames: performerConfig.mcpServerNames,
                    workingDir: this.workingDir,
                })
                await ensureActToolFiles(this.workingDir, this.workingDir)
            } catch (error) {
                console.warn(
                    `[act-runtime] Failed to prewarm projection for "${participantKey}" in act "${actDefinition.id}": ${errorMessage(error)}`,
                )
            }
        }
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

    async listBoard(threadId: string, input: ListBoardInput = {}) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const entries = runtime.mailbox.getBoardSnapshot()
            .filter((entry) => (input.kind ? entry.kind === input.kind : true))
            .sort((left, right) => right.timestamp - left.timestamp)
            .slice(0, normalizeBoardReadLimit(input.limit))

        return {
            ok: true as const,
            entries: input.summaryOnly === false ? entries : entries.map((entry) => summarizeBoardEntry(entry)),
        }
    }

    async getBoardEntry(threadId: string, key: string) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const normalizedKey = key.trim()
        if (!normalizedKey) {
            return { ok: false as const, status: 400, error: 'Shared note key is required' }
        }

        const entry = runtime.mailbox.readBoard(normalizedKey)
        if (!entry) {
            return { ok: false as const, status: 404, error: `Shared note "${normalizedKey}" not found` }
        }

        return { ok: true as const, entry }
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

        return this.listBoard(threadId, { limit: input.limit, summaryOnly: input.summaryOnly })
    }

    async syncActDefinition(actId: string, actDefinition: ActDefinition) {
        await this.ensureThreadsLoaded()
        const threadIds = this.threadManager.listThreadIds(actId, ['active', 'idle'])
        let anySynced = false

        for (const threadId of threadIds) {
            const synced = await this.threadManager.syncThreadActDefinition(threadId, actDefinition)
            if (!synced) continue
            anySynced = true

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

        if (anySynced) {
            await this.prewarmActParticipantProjections(actDefinition)
        }

        return { ok: true as const, threads: this.threadManager.listThreads(actId) }
    }

    async setWakeCondition(threadId: string, body: SetWakeConditionInput) {
        await this.ensureThreadsLoaded()
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }

        const validatedCondition = validateConditionExpr(body.condition)
        if (!validatedCondition.ok) {
            return { ok: false as const, status: 400, error: validatedCondition.error }
        }

        const actDefinition = this.threadManager.getActDefinition(threadId)

        const replacedConditions = runtime.mailbox.removeWakeConditionsForParticipant(body.createdBy)
        for (const condition of replacedConditions) {
            this.clearWakeConditionAlarm(threadId, condition.id)
        }

        const wakeCondition = runtime.mailbox.addWakeCondition({
            target: body.target,
            createdBy: body.createdBy,
            onSatisfiedMessage: body.onSatisfiedMessage,
            condition: validatedCondition.value,
        })

        if (actDefinition) {
            const recentEvents = await this.threadManager.getRecentEvents(threadId, 20)
            if (evaluateWakeCondition(wakeCondition, runtime.mailbox.getBoardMap(), recentEvents, actDefinition)) {
                wakeCondition.status = 'triggered'
                void processWakeTargets(
                    [{
                        participantKey: wakeCondition.createdBy,
                        triggerEvent: {
                            id: nanoid(),
                            type: 'runtime.idle',
                            sourceType: 'system',
                            source: 'wait_until',
                            timestamp: Date.now(),
                            payload: { threadId, conditionId: wakeCondition.id },
                        },
                        wakeCondition,
                        reason: 'wake-condition',
                    }],
                    actDefinition,
                    runtime.mailbox,
                    this.threadManager,
                    threadId,
                    this.workingDir,
                ).catch((error) => {
                    console.error('[act-runtime] Immediate wake condition cascade error:', error)
                })
            } else {
                this.scheduleWakeConditionAlarm(threadId, wakeCondition)
            }
        }

        return { ok: true as const, conditionId: wakeCondition.id }
    }

    async createThread(actId: string, actDefinition?: ActDefinition) {
        const thread = await this.threadManager.createThread(actId, actDefinition)
        await this.prewarmActParticipantProjections(actDefinition)
        return {
            ok: true as const,
            thread: this.threadManager.getThreadSummary(thread.id) as ActThreadSummary,
        }
    }

    async renameThread(_actId: string, threadId: string, name: string, options?: { ifUnset?: boolean }) {
        await this.ensureThreadsLoaded()
        const thread = await this.threadManager.setThreadName(threadId, name, options)
        if (!thread) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }
        return {
            ok: true as const,
            thread,
        }
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
        this.clearThreadWakeConditionAlarms(threadId)
        const deleted = await this.threadManager.deleteThread(threadId)
        if (!deleted) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }
        return { ok: true as const }
    }

    async getThread(threadId: string) {
        await this.ensureThreadsLoaded()
        const thread = this.threadManager.getThreadSummary(threadId)
        if (!thread) {
            return { ok: false as const, status: 404, error: `Thread ${threadId} not found` }
        }
        return { ok: true as const, thread }
    }

    async getRecentEvents(threadId: string, count = 50, before = 0) {
        await this.ensureThreadsLoaded()
        const page = await this.threadManager.getRecentEventsPage(threadId, count, before)
        return { ok: true as const, ...page }
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
        await this.threadManager.setParticipantStatus(threadId, participantKey, { type: 'busy' })
    }

    async clearParticipantSessionBusy(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        clearParticipantQueueRunning(threadId, participantKey)
        await this.threadManager.setParticipantStatus(threadId, participantKey, { type: 'idle' })
    }

    async setParticipantSessionStatus(
        threadId: string,
        participantKey: string,
        status: { type: 'idle' | 'busy' | 'retry' | 'error'; message?: string },
    ) {
        await this.ensureThreadsLoaded()
        await this.threadManager.setParticipantStatus(threadId, participantKey, status)
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
     * Emit a system-level runtime.idle follow-up after a successful cascade.
     * This remains a runtime trigger for subscribed participants, not a normal
     * participant-facing coordination hint in the agent context.
     *
     * The follow-up idle cascade is intentionally fire-and-forget and does not
     * feed back into maybeEmitRuntimeIdle, which keeps idle emission non-recursive.
     */
    private async maybeEmitRuntimeIdle(
        threadId: string,
        cascadeResult: import('./wake-cascade.js').WakeCascadeResult,
        actDefinition: ActDefinition,
        mailbox: import('./mailbox.js').Mailbox,
    ): Promise<void> {
        // Only emit after at least one wake was actually injected.
        if (cascadeResult.errors.length > 0) return
        if (cascadeResult.injected.length === 0) return

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

        // Route the idle event once as a system trigger. This follow-up cascade
        // intentionally does not chain back into maybeEmitRuntimeIdle.
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
