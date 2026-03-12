// DOT Integration Routes — .dance-of-tal management

import { Hono } from 'hono'
import { getPerformer, listLockedPerformerNames } from 'dance-of-tal/lib/registry'
import { readAgentManifest, writeAgentManifest } from 'dance-of-tal/lib/agents'
import { searchRegistry } from 'dance-of-tal/lib/installer'
import type { Performer } from 'dance-of-tal/data/types'
import type { StudioAssetKind } from '../lib/dot-authoring.js'
import { getDotAuthUser, getDotStatus, initDotRegistry, installDotAsset, loginToDot, logoutFromDot, publishDotAsset, saveDotLocalAsset } from '../services/dot-service.js'

/** Validates that performer URNs follow the 3-part format: kind/@author/name */
function validatePerformer(performer: Performer): void {
    const tal = performer.tal ?? null
    const dances = performer.dance
        ? (Array.isArray(performer.dance) ? performer.dance : [performer.dance])
        : []
    const act = performer.act ?? null

    if (!tal && dances.length === 0) {
        throw new Error("Invalid performer: at least one of 'tal' or 'dance' must be present.")
    }

    const validateUrn = (urn: string, prefix: string) => {
        const parts = urn.split('/')
        if (parts.length !== 3 || parts[0] !== prefix || !parts[1].startsWith('@') || !parts[2]) {
            throw new Error(`Invalid URN: '${urn}'. Expected: ${prefix}/@<author>/<name>`)
        }
    }

    if (tal) validateUrn(tal, 'tal')
    for (const d of dances) validateUrn(d, 'dance')
    if (act) validateUrn(act, 'act')
}
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
        const result = await listLockedPerformerNames(cwd)
        return c.json(result)
    } catch (err: any) {
        return c.json({ names: [], skipped: [] })
    }
})

dot.get('/api/dot/performers/:name', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const name = c.req.param('name')
    try {
        const performer = await getPerformer(cwd, name)
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
        const manifest = await readAgentManifest(cwd)
        return c.json(manifest)
    } catch (err: any) {
        return c.json({})
    }
})

dot.put('/api/dot/agents', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const manifest = await c.req.json<Record<string, string>>()
    try {
        await writeAgentManifest(cwd, manifest)
        return c.json({ ok: true })
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
        const results = await searchRegistry(query, { kind, limit })
        return c.json(results)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Validate Performer ──────────────────────────────────
dot.post('/api/dot/validate', async (c) => {
    const performer = await c.req.json()
    try {
        validatePerformer(performer)
        return c.json({ valid: true })
    } catch (err: any) {
        return c.json({ valid: false, error: err.message })
    }
})

export default dot
