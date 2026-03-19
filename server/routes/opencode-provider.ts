import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import {
    authorizeProviderOauth,
    completeProviderOauth,
    deleteProviderAuth,
    updateProviderAuth,
} from '../services/opencode-service.js'

const opencodeProvider = new Hono()

opencodeProvider.post('/api/provider/:id/oauth/authorize', async (c) => {
    const { method } = await c.req.json<{ method: number }>()
    try {
        return c.json(await authorizeProviderOauth(resolveRequestWorkingDir(c), c.req.param('id'), method))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.post('/api/provider/:id/oauth/callback', async (c) => {
    const { method, code } = await c.req.json<{ method: number; code?: string }>()
    try {
        return c.json(await completeProviderOauth(resolveRequestWorkingDir(c), c.req.param('id'), method, code))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.put('/api/provider/:id/auth', async (c) => {
    const auth = await c.req.json()
    try {
        return c.json(await updateProviderAuth(c.req.param('id'), auth))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.delete('/api/provider/:id/auth', async (c) => {
    try {
        return c.json(await deleteProviderAuth(c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

export default opencodeProvider
