import { Hono } from 'hono'
import {
    getDotPerformer,
    searchDotRegistry,
    validateDotPerformer,
} from '../services/dot-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotPerformer = new Hono()

dotPerformer.get('/api/dot/performers/:urn{.+}', async (c) => {
    const cwd = requestWorkingDir(c)
    const urn = c.req.param('urn')
    try {
        const performer = await getDotPerformer(cwd, `performer/${urn}`)
        if (!performer) return jsonError(c, 'Performer not found', 404)
        return c.json(performer)
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
