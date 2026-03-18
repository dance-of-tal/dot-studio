/**
 * act-runtime.ts — Act runtime API routes
 *
 * Endpoints for Act tool calls (invoked by generated custom tools).
 * PRD §13, §15: Tool call processing → mailbox state change → event → routing → wake-up.
 */

import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { getActRuntimeService } from '../services/act-runtime/act-runtime-service.js'

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
    const service = getActRuntimeService(workingDir)
    const result = await service.sendMessage(threadId, body)
    if (!result.ok) {
        return c.json(result, result.status as 404 | 429)
    }
    return c.json(result)
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
    const service = getActRuntimeService(workingDir)
    const result = await service.postToBoard(threadId, body)
    if (!result.ok) {
        return c.json(result, result.status as 403 | 404 | 429)
    }
    return c.json(result)
})

// ── Read Board ──────────────────────────────────────────
actRuntime.get('/api/act/:actId/thread/:threadId/read-board', async (c) => {
    const threadId = c.req.param('threadId')
    const key = c.req.query('key')

    const workingDir = resolveRequestWorkingDir(c)
    const service = getActRuntimeService(workingDir)
    const result = service.readBoard(threadId, key)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
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
    const service = getActRuntimeService(workingDir)
    const result = service.setWakeCondition(threadId, body)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

// ── Thread management ───────────────────────────────────
actRuntime.post('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    const workingDir = resolveRequestWorkingDir(c)
    const body = await c.req.json<{ actDefinition?: any }>().catch(() => ({ actDefinition: undefined }))
    const service = getActRuntimeService(workingDir)
    return c.json(service.createThread(actId, body.actDefinition))
})

actRuntime.get('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    const workingDir = resolveRequestWorkingDir(c)
    const service = getActRuntimeService(workingDir)
    return c.json(service.listThreads(actId))
})

actRuntime.get('/api/act/:actId/thread/:threadId', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = resolveRequestWorkingDir(c)
    const service = getActRuntimeService(workingDir)
    const result = service.getThread(threadId)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

// ── Event tail (for UI Activity View) ───────────────────
actRuntime.get('/api/act/:actId/thread/:threadId/events', async (c) => {
    const threadId = c.req.param('threadId')
    const count = parseInt(c.req.query('count') || '50', 10)
    const workingDir = resolveRequestWorkingDir(c)
    const service = getActRuntimeService(workingDir)
    return c.json(await service.getRecentEvents(threadId, count))
})

export default actRuntime
