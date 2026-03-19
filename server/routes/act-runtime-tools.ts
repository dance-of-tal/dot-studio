import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { getActRuntimeService } from '../services/act-runtime/act-runtime-service.js'

const actRuntimeTools = new Hono()

actRuntimeTools.post('/api/act/:actId/thread/:threadId/send-message', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<{
        from: string
        to: string
        content: string
        tag?: string
    }>()

    const result = await getActRuntimeService(resolveRequestWorkingDir(c)).sendMessage(threadId, body)
    if (!result.ok) {
        return c.json(result, result.status as 404 | 429)
    }
    return c.json(result)
})

actRuntimeTools.post('/api/act/:actId/thread/:threadId/post-to-board', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<{
        author: string
        key: string
        kind: 'artifact' | 'fact' | 'task'
        content: string
        updateMode?: 'replace' | 'append'
        metadata?: Record<string, unknown>
    }>()

    const result = await getActRuntimeService(resolveRequestWorkingDir(c)).postToBoard(threadId, body)
    if (!result.ok) {
        return c.json(result, result.status as 403 | 404 | 429)
    }
    return c.json(result)
})

actRuntimeTools.get('/api/act/:actId/thread/:threadId/read-board', async (c) => {
    const threadId = c.req.param('threadId')
    const key = c.req.query('key')
    const result = getActRuntimeService(resolveRequestWorkingDir(c)).readBoard(threadId, key)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

actRuntimeTools.post('/api/act/:actId/thread/:threadId/set-wake-condition', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<{
        createdBy: string
        target: 'self'
        onSatisfiedMessage: string
        condition: any
    }>()

    const result = getActRuntimeService(resolveRequestWorkingDir(c)).setWakeCondition(threadId, body)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

export default actRuntimeTools
