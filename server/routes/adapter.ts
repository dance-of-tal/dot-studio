import { Hono } from 'hono'
import { dispatchAdapterViewAction, listAdapterViewProjections } from '../services/adapter-view-service.js'
import type { AdapterViewActionRequest } from '../../shared/adapter-view.js'
import { createSSEResponse } from '../lib/sse.js'

const adapter = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Adapter action is not available yet.'
}

adapter.get('/api/adapter/views', async (c) => {
    const performerId = c.req.query('performerId')?.trim()
    const projections = await listAdapterViewProjections(performerId || undefined)
    return c.json({ projections })
})

adapter.post('/api/adapter/action', async (c) => {
    try {
        const body = await c.req.json<AdapterViewActionRequest>()
        const result = await dispatchAdapterViewAction(body)
        return c.json(result)
    } catch (error: unknown) {
        return c.json({ error: errorMessage(error) }, 501)
    }
})

adapter.get('/api/adapter/events', async () => {
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(encoder.encode(': adapter stream placeholder\n\n'))
        },
    })

    return createSSEResponse(stream)
})

export default adapter
