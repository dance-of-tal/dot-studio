import { Hono } from 'hono'
import type { PerformerAssetV1 } from '../lib/dot-source.js'
import {
    getDotPerformer,
    searchDotRegistry,
    validateDotPerformer,
} from '../services/dot-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotPerformer = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

dotPerformer.get('/api/dot/performers/:urn{.+}', async (c) => {
    const cwd = requestWorkingDir(c)
    const urn = c.req.param('urn')
    try {
        const performer = await getDotPerformer(cwd, `performer/${urn}`)
        if (!performer) return jsonError(c, 'Performer not found', 404)
        return c.json(performer)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

dotPerformer.get('/api/dot/search', async (c) => {
    const query = c.req.query('q') || ''
    const kind = c.req.query('kind')
    const limit = parseInt(c.req.query('limit') || '20', 10)
    try {
        return c.json(await searchDotRegistry(query, { kind, limit }))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

dotPerformer.post('/api/dot/validate', async (c) => {
    const performer = await c.req.json<PerformerAssetV1>()
    try {
        validateDotPerformer(performer)
        return c.json({ valid: true })
    } catch (error: unknown) {
        return c.json({ valid: false, error: errorMessage(error) })
    }
})

export default dotPerformer
