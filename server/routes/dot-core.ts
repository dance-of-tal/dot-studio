import { Hono } from 'hono'
import {
    getDotAuthUser,
    getDotStatusSnapshot,
    initDotRegistry,
    loginToDot,
    logoutFromDot,
} from '../services/dot-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotCore = new Hono()

dotCore.get('/api/dot/status', async (c) => {
    return c.json(await getDotStatusSnapshot(requestWorkingDir(c)))
})

dotCore.post('/api/dot/init', async (c) => {
    const { scope } = await c.req.json<{ scope?: string }>().catch(() => ({ scope: undefined }))
    try {
        return c.json(await initDotRegistry(requestWorkingDir(c), scope))
    } catch (err: any) {
        return jsonError(c, err.message, 500)
    }
})

dotCore.get('/api/dot/auth-user', async () => {
    try {
        return Response.json(await getDotAuthUser())
    } catch (err: any) {
        return Response.json({ authenticated: false, username: null, error: err.message }, { status: 500 })
    }
})

dotCore.post('/api/dot/login', async (c) => {
    const body = await c.req.json<{ acknowledgedTos?: boolean }>().catch((): { acknowledgedTos?: boolean } => ({}))
    if (!body?.acknowledgedTos) {
        return jsonError(c, 'Review and accept the Dance of Tal Terms of Service before signing in: https://danceoftal.com/tos', 400)
    }

    try {
        return c.json(await loginToDot())
    } catch (err: any) {
        return jsonError(c, err.message || 'Failed to start dot login.', 500)
    }
})

dotCore.post('/api/dot/logout', async (c) => {
    try {
        return c.json(await logoutFromDot())
    } catch (err: any) {
        return jsonError(c, err.message || 'Failed to sign out.', 500)
    }
})

export default dotCore
