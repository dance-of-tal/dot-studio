import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { getActRuntimeService } from '../services/act-runtime/act-runtime-service.js'

const actRuntimeThreads = new Hono()

actRuntimeThreads.post('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    const body = await c.req.json<{ actDefinition?: any }>().catch(() => ({ actDefinition: undefined }))
    return c.json(getActRuntimeService(resolveRequestWorkingDir(c)).createThread(actId, body.actDefinition))
})

actRuntimeThreads.get('/api/act/:actId/threads', async (c) => {
    const actId = c.req.param('actId')
    return c.json(getActRuntimeService(resolveRequestWorkingDir(c)).listThreads(actId))
})

actRuntimeThreads.get('/api/act/:actId/thread/:threadId', async (c) => {
    const threadId = c.req.param('threadId')
    const result = getActRuntimeService(resolveRequestWorkingDir(c)).getThread(threadId)
    if (!result.ok) {
        return c.json(result, result.status as 404)
    }
    return c.json(result)
})

actRuntimeThreads.get('/api/act/:actId/thread/:threadId/events', async (c) => {
    const threadId = c.req.param('threadId')
    const count = parseInt(c.req.query('count') || '50', 10)
    return c.json(await getActRuntimeService(resolveRequestWorkingDir(c)).getRecentEvents(threadId, count))
})

export default actRuntimeThreads
