import { Hono } from 'hono'
import type {
    ProviderOauthAuthorizeRequest,
    ProviderOauthCallbackRequest,
} from '../../shared/provider-auth.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import {
    authorizeProviderOauth,
    completeProviderOauth,
    deleteProviderAuth,
    updateProviderAuth,
} from '../services/opencode-service.js'
import { requestWorkingDir } from './route-errors.js'

const opencodeProvider = new Hono()

opencodeProvider.post('/api/provider/:id/oauth/authorize', async (c) => {
    const { method, inputs } = await c.req.json<ProviderOauthAuthorizeRequest>()
    try {
        return c.json(await authorizeProviderOauth(requestWorkingDir(c), c.req.param('id'), method, inputs))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.post('/api/provider/:id/oauth/callback', async (c) => {
    const { method, code } = await c.req.json<ProviderOauthCallbackRequest>()
    try {
        return c.json(await completeProviderOauth(requestWorkingDir(c), c.req.param('id'), method, code))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.put('/api/provider/:id/auth', async (c) => {
    const auth = await c.req.json()
    try {
        return c.json(await updateProviderAuth(requestWorkingDir(c), c.req.param('id'), auth))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.delete('/api/provider/:id/auth', async (c) => {
    try {
        return c.json(await deleteProviderAuth(requestWorkingDir(c), c.req.param('id')))
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

export default opencodeProvider
