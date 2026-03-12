import { Hono } from 'hono'
import { dispatchAdapterViewAction, listAdapterViewProjections } from '../services/adapter-view-service.js'
import type { AdapterViewActionRequest } from '../../shared/adapter-view.js'

const adapter = new Hono()

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
    } catch (err: any) {
        return c.json({ error: err.message || 'Adapter action is not available yet.' }, 501)
    }
})

adapter.get('/api/adapter/events', async (_c) => {
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(encoder.encode(': adapter stream placeholder\n\n'))
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    })
})

export default adapter
