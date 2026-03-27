import { Hono } from 'hono'
import {
    getDotAuthUser,
    getDotStatusSnapshot,
    initDotRegistry,
    loginToDot,
    logoutFromDot,
} from '../services/dot-service.js'
import { addDanceFromGitHub } from '../services/dot-add-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotCore = new Hono()

function errorMessage(error: unknown, fallback = 'Unknown error') {
    return error instanceof Error && error.message ? error.message : fallback
}

dotCore.get('/api/dot/status', async (c) => {
    return c.json(await getDotStatusSnapshot(requestWorkingDir(c)))
})

dotCore.post('/api/dot/init', async (c) => {
    const { scope } = await c.req.json<{ scope?: string }>().catch(() => ({ scope: undefined }))
    try {
        return c.json(await initDotRegistry(requestWorkingDir(c), scope))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

dotCore.get('/api/dot/auth-user', async () => {
    try {
        return Response.json(await getDotAuthUser())
    } catch (error: unknown) {
        return Response.json({ authenticated: false, username: null, error: errorMessage(error) }, { status: 500 })
    }
})

dotCore.post('/api/dot/login', async (c) => {
    const body = await c.req.json<{ acknowledgedTos?: boolean }>().catch((): { acknowledgedTos?: boolean } => ({}))
    if (!body?.acknowledgedTos) {
        return jsonError(c, 'Review and accept the Dance of Tal Terms of Service before signing in: https://danceoftal.com/tos', 400)
    }

    try {
        return c.json(await loginToDot())
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to start dot login.'), 500)
    }
})

dotCore.post('/api/dot/logout', async (c) => {
    try {
        return c.json(await logoutFromDot())
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to sign out.'), 500)
    }
})

dotCore.post('/api/dot/add', async (c) => {
    const { source, scope } = await c.req.json<{ source: string; scope?: 'global' | 'stage' }>()
    if (!source?.trim()) {
        return jsonError(c, 'Missing source (e.g. owner/repo)', 400)
    }
    try {
        const result = await addDanceFromGitHub(requestWorkingDir(c), source.trim(), scope)
        return c.json(result)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to add dance from GitHub.'), 500)
    }
})

export default dotCore
