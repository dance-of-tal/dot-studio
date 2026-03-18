// DOT Integration Routes — .dance-of-tal management

import { Hono } from 'hono'
import type { StudioAssetKind } from '../lib/dot-authoring.js'
import {
    getDotAgentManifest,
    getDotAuthUser,
    getDotPerformer,
    getDotStatus,
    initDotRegistry,
    installDotAsset,
    listDotPerformers,
    loginToDot,
    logoutFromDot,
    publishDotAsset,
    saveDotAgentManifest,
    saveDotLocalAsset,
    searchDotRegistry,
    validateDotPerformer,
} from '../services/dot-service.js'
import { invalidate } from '../lib/cache.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'

const dot = new Hono()

// ── DOT Status ──────────────────────────────────────────
dot.get('/api/dot/status', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    try {
        return c.json(await getDotStatus(cwd))
    } catch {
        return c.json(await getDotStatus(cwd).catch(() => ({
            initialized: false,
            stageInitialized: false,
            globalInitialized: false,
            dotDir: '',
            globalDotDir: '',
            projectDir: cwd,
        })))
    }
})

// ── DOT Init ────────────────────────────────────────────
dot.post('/api/dot/init', async (c) => {
    const { scope } = await c.req.json<{ scope?: string }>().catch(() => ({ scope: undefined }))
    try {
        return c.json(await initDotRegistry(resolveRequestWorkingDir(c), scope))
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Auth User ───────────────────────────────────────────
dot.get('/api/dot/auth-user', async (c) => {
    try {
        return c.json(await getDotAuthUser())
    } catch (err: any) {
        return c.json({ authenticated: false, username: null, error: err.message }, 500)
    }
})

dot.post('/api/dot/login', async (c) => {
    const body = await c.req.json<{ acknowledgedTos?: boolean }>().catch((): { acknowledgedTos?: boolean } => ({}))
    if (!body?.acknowledgedTos) {
        return c.json({
            error: 'Review and accept the Dance of Tal Terms of Service before signing in: https://danceoftal.com/tos',
        }, 400)
    }

    try {
        return c.json(await loginToDot())
    } catch (err: any) {
        return c.json({ error: err.message || 'Failed to start dot login.' }, 500)
    }
})

dot.post('/api/dot/logout', async (c) => {
    try {
        return c.json(await logoutFromDot())
    } catch (err: any) {
        return c.json({ error: err.message || 'Failed to sign out.' }, 500)
    }
})

// ── Performer Lockfiles ─────────────────────────────────
dot.get('/api/dot/performers', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    try {
        return c.json(await listDotPerformers(cwd))
    } catch (err: any) {
        return c.json({ names: [], skipped: [] })
    }
})

dot.get('/api/dot/performers/:name', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const name = c.req.param('name')
    try {
        const performer = await getDotPerformer(cwd, name)
        if (!performer) return c.json({ error: 'Performer not found' }, 404)
        return c.json({ name, ...performer })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Agent Manifest ──────────────────────────────────────
dot.get('/api/dot/agents', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    try {
        return c.json(await getDotAgentManifest(cwd))
    } catch (err: any) {
        return c.json({})
    }
})

dot.put('/api/dot/agents', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const manifest = await c.req.json<Record<string, string>>()
    try {
        return c.json(await saveDotAgentManifest(cwd, manifest))
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Install (with scope: 'global' | 'stage') ────────────
dot.post('/api/dot/install', async (c) => {
    const body = await c.req.json<{
        urn: string
        localName?: string
        force?: boolean
        scope?: 'global' | 'stage'
    }>()

    try {
        const result = await installDotAsset(resolveRequestWorkingDir(c), body)
        invalidate('assets')
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Local Asset Save ────────────────────────────────────
dot.put('/api/dot/assets/local', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        author?: string
        payload: unknown
    }>().catch(() => null)

    if (!body?.kind || !body?.slug) {
        return c.json({ error: 'kind and slug are required.' }, 400)
    }

    try {
        const saved = await saveDotLocalAsset(cwd, body)
        invalidate('assets')
        return c.json(saved)
    } catch (err: any) {
        return c.json({ error: err.message }, 400)
    }
})

// ── Publish Local / Draft Asset ────────────────────────
dot.post('/api/dot/assets/publish', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        payload?: unknown
        tags?: string[]
        acknowledgedTos?: boolean
    }>().catch(() => null)

    if (!body?.kind || !body?.slug) {
        return c.json({ error: 'kind and slug are required.' }, 400)
    }
    if (!body.acknowledgedTos) {
        return c.json({
            error: 'Review and accept the Dance of Tal Terms of Service before publishing: https://danceoftal.com/tos',
        }, 400)
    }

    try {
        const result = await publishDotAsset(cwd, body)
        invalidate('assets')
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, err?.status === 401 ? 401 : 400)
    }
})

// ── Search Registry ─────────────────────────────────────
dot.get('/api/dot/search', async (c) => {
    const query = c.req.query('q') || ''
    const kind = c.req.query('kind')
    const limit = parseInt(c.req.query('limit') || '20', 10)
    try {
        return c.json(await searchDotRegistry(query, { kind, limit }))
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Validate Performer ──────────────────────────────────
dot.post('/api/dot/validate', async (c) => {
    const performer = await c.req.json()
    try {
        validateDotPerformer(performer)
        return c.json({ valid: true })
    } catch (err: any) {
        return c.json({ valid: false, error: err.message })
    }
})

export default dot
