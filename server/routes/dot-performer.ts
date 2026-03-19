import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    getDotAgentManifest,
    getDotPerformer,
    listDotPerformers,
    saveDotAgentManifest,
    searchDotRegistry,
    validateDotPerformer,
} from '../services/dot-service.js'
import { jsonError } from './route-errors.js'

const dotPerformer = new Hono()

dotPerformer.get('/api/dot/performers', async (c) => {
    try {
        return c.json(await listDotPerformers(resolveRequestWorkingDir(c)))
    } catch {
        return c.json({ names: [], skipped: [] })
    }
})

dotPerformer.get('/api/dot/performers/:name', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const name = c.req.param('name')
    try {
        const performer = await getDotPerformer(cwd, name)
        if (!performer) return jsonError(c, 'Performer not found', 404)
        return c.json({ name, ...performer })
    } catch (err: any) {
        return jsonError(c, err.message, 500)
    }
})

dotPerformer.get('/api/dot/agents', async (c) => {
    try {
        return c.json(await getDotAgentManifest(resolveRequestWorkingDir(c)))
    } catch {
        return c.json({})
    }
})

dotPerformer.put('/api/dot/agents', async (c) => {
    const manifest = await c.req.json<Record<string, string>>()
    try {
        return c.json(await saveDotAgentManifest(resolveRequestWorkingDir(c), manifest))
    } catch (err: any) {
        return jsonError(c, err.message, 500)
    }
})

dotPerformer.get('/api/dot/search', async (c) => {
    const query = c.req.query('q') || ''
    const kind = c.req.query('kind')
    const limit = parseInt(c.req.query('limit') || '20', 10)
    try {
        return c.json(await searchDotRegistry(query, { kind, limit }))
    } catch (err: any) {
        return jsonError(c, err.message, 500)
    }
})

dotPerformer.post('/api/dot/validate', async (c) => {
    const performer = await c.req.json()
    try {
        validateDotPerformer(performer)
        return c.json({ valid: true })
    } catch (err: any) {
        return c.json({ valid: false, error: err.message })
    }
})

export default dotPerformer
