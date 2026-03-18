/**
 * act-runtime.ts — Act runtime API routes
 *
 * Endpoints for Act tool calls (invoked by generated custom tools).
 * PRD §13, §15: Tool call processing → mailbox state change → event → routing → wake-up.
 */

import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import type { MailboxEvent } from '../../shared/act-types.js'
import { ThreadManager } from '../services/act-runtime/thread-manager.js'
import { SafetyGuard } from '../services/act-runtime/safety-guard.js'
import { processWakeCascade } from '../services/act-runtime/wake-cascade.js'

// ── Singleton runtime state ─────────────────────────────
// In production these would be injected; for now, use module-level singletons.

let threadManager: ThreadManager | null = null
const safetyGuards: Map<string, SafetyGuard> = new Map()

function getThreadManager(workingDir: string): ThreadManager {
    if (!threadManager) {
        threadManager = new ThreadManager(workingDir)
    }
    return threadManager
}

function getSafetyGuard(threadId: string): SafetyGuard {
    if (!safetyGuards.has(threadId)) {
        safetyGuards.set(threadId, new SafetyGuard())
    }
    return safetyGuards.get(threadId)!
}

// ── Routes ──────────────────────────────────────────────

const actRuntime = new Hono()

// ── Send Message ────────────────────────────────────────
actRuntime.post('/api/act/:actId/thread/:threadId/send-message', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<{
        from: string
        to: string
        content: string
        tag?: string
    }>()

    const workingDir = resolveRequestWorkingDir(c)
    const tm = getThreadManager(workingDir)
    const runtime = tm.getThreadRuntime(threadId)
    if (!runtime) {
        return c.json({ ok: false, error: `Thread ${threadId} not found` }, 404)
    }

    // Safety checks
    const guard = getSafetyGuard(threadId)
    const pairCheck = guard.checkPairBudget(body.from, body.to)
    if (!pairCheck.ok) {
        return c.json({ ok: false, error: pairCheck.reason }, 429)
    }
    const loopCheck = guard.checkLoopDetection(body.from, body.to, body.tag)
    if (!loopCheck.ok) {
        return c.json({ ok: false, error: loopCheck.reason }, 429)
    }

    // Add message to mailbox
    const message = runtime.mailbox.addMessage({
        from: body.from,
        to: body.to,
        content: body.content,
        tag: body.tag,
        threadId,
    })

    // Create and log event
    const event: MailboxEvent = {
        id: nanoid(),
        type: 'message.sent',
        sourceType: 'performer',
        source: body.from,
        timestamp: Date.now(),
        payload: { messageId: message.id, from: body.from, to: body.to, tag: body.tag, threadId },
    }
    await tm.logEvent(threadId, event)

    // Event budget check
    const budgetCheck = guard.checkEventBudget(event)
    if (!budgetCheck.ok) {
        return c.json({ ok: true, warning: budgetCheck.reason })
    }

    // Wake-up cascade: route event → wake target performers
    const actDef = tm.getActDefinition(threadId)
    let cascade = null
    if (actDef) {
        cascade = await processWakeCascade(event, actDef, runtime.mailbox, tm, threadId)
    }

    return c.json({ ok: true, messageId: message.id, cascade })
})

// ── Post to Board ───────────────────────────────────────
actRuntime.post('/api/act/:actId/thread/:threadId/post-to-board', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<{
        author: string
        key: string
        kind: 'artifact' | 'fact' | 'task'
        content: string
        updateMode?: 'replace' | 'append'
        metadata?: Record<string, unknown>
    }>()

    const workingDir = resolveRequestWorkingDir(c)
    const tm = getThreadManager(workingDir)
    const runtime = tm.getThreadRuntime(threadId)
    if (!runtime) {
        return c.json({ ok: false, error: `Thread ${threadId} not found` }, 404)
    }

    // Safety: board update budget
    const guard = getSafetyGuard(threadId)
    const boardCheck = guard.checkBoardUpdateBudget(body.key)
    if (!boardCheck.ok) {
        return c.json({ ok: false, error: boardCheck.reason }, 429)
    }

    // Post to board
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

        // Persist board after post
        await tm.persistBoard(threadId)

        // Create and log event
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
        await tm.logEvent(threadId, event)

        // Wake-up cascade: route event → wake target performers
        const actDef = tm.getActDefinition(threadId)
        let cascade = null
        if (actDef) {
            cascade = await processWakeCascade(event, actDef, runtime.mailbox, tm, threadId)
        }

        return c.json({ ok: true, entryId: entry.id, version: entry.version, cascade })
    } catch (err: any) {
        return c.json({ ok: false, error: err.message }, 403)
    }
})

// ── Read Board ──────────────────────────────────────────
actRuntime.get('/api/act/:actId/thread/:threadId/read-board', async (c) => {
    const threadId = c.req.param('threadId')
    const key = c.req.query('key')

    const workingDir = resolveRequestWorkingDir(c)
    const tm = getThreadManager(workingDir)
    const runtime = tm.getThreadRuntime(threadId)
    if (!runtime) {
        return c.json({ ok: false, error: `Thread ${threadId} not found` }, 404)
    }

    if (key) {
        const entry = runtime.mailbox.readBoard(key)
        return c.json({ ok: true, entries: entry ? [entry] : [] })
    }
    return c.json({ ok: true, entries: runtime.mailbox.getBoardSnapshot() })
})

// ── Set Wake Condition ──────────────────────────────────
actRuntime.post('/api/act/:actId/thread/:threadId/set-wake-condition', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<{
        createdBy: string
        target: 'self'
        onSatisfiedMessage: string
        condition: any
    }>()

    const workingDir = resolveRequestWorkingDir(c)
    const tm = getThreadManager(workingDir)
    const runtime = tm.getThreadRuntime(threadId)
    if (!runtime) {
        return c.json({ ok: false, error: `Thread ${threadId} not found` }, 404)
    }

    const wakeCondition = runtime.mailbox.addWakeCondition({
        target: body.target,
        createdBy: body.createdBy,
        onSatisfiedMessage: body.onSatisfiedMessage,
        condition: body.condition,
    })

    return c.json({ ok: true, conditionId: wakeCondition.id })
})

// ── Thread management ───────────────────────────────────
actRuntime.post('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    const workingDir = resolveRequestWorkingDir(c)
    const body = await c.req.json<{ actDefinition?: any }>().catch(() => ({ actDefinition: undefined }))
    const tm = getThreadManager(workingDir)
    const thread = tm.createThread(actId, body.actDefinition)
    return c.json({ ok: true, thread })
})

actRuntime.get('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    const workingDir = resolveRequestWorkingDir(c)
    const tm = getThreadManager(workingDir)
    return c.json({ ok: true, threads: tm.listThreads(actId) })
})

actRuntime.get('/api/act/:actId/thread/:threadId', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = resolveRequestWorkingDir(c)
    const tm = getThreadManager(workingDir)
    const thread = tm.getThread(threadId)
    if (!thread) {
        return c.json({ ok: false, error: `Thread ${threadId} not found` }, 404)
    }
    return c.json({ ok: true, thread })
})

// ── Event tail (for UI Activity View) ───────────────────
actRuntime.get('/api/act/:actId/thread/:threadId/events', async (c) => {
    const threadId = c.req.param('threadId')
    const count = parseInt(c.req.query('count') || '50', 10)
    const workingDir = resolveRequestWorkingDir(c)
    const tm = getThreadManager(workingDir)
    const events = await tm.getRecentEvents(threadId, count)
    return c.json({ ok: true, events })
})

export default actRuntime
