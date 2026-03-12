// DOT Integration Routes — .dance-of-tal management

import { Hono } from 'hono'
import fs from 'fs/promises'
import { getDotDir, initRegistry, getPerformer, listLockedPerformerNames, getGlobalDotDir, getGlobalCwd, ensureDotDir } from 'dance-of-tal/lib/registry'
import { readAgentManifest, writeAgentManifest } from 'dance-of-tal/lib/agents'
import { installActWithDependencies, installAsset, installPerformerAndLock, searchRegistry } from 'dance-of-tal/lib/installer'
import type { Performer } from 'dance-of-tal/data/types'
import { clearDotAuthUser, publishStudioAsset, readDotAuthUser, saveLocalStudioAsset, type StudioAssetKind } from '../lib/dot-authoring.js'
import { startDotLogin } from '../lib/dot-login.js'

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

// ── Helpers ─────────────────────────────────────────────

function resolveCwd(cwd: string, scope?: string): string {
    if (scope === 'global') return getGlobalCwd()
    return cwd
}

// Uses ensureDotDir() from lib/registry (auto-inits workspace if missing)

// ── DOT Status ──────────────────────────────────────────
dot.get('/api/dot/status', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const dotDir = getDotDir(cwd)
    const globalDotDir = getGlobalDotDir()
    try {
        const [stageExists, globalExists] = await Promise.all([
            fs.access(dotDir).then(() => true).catch(() => false),
            fs.access(globalDotDir).then(() => true).catch(() => false),
        ])
        return c.json({
            initialized: stageExists || globalExists,
            stageInitialized: stageExists,
            globalInitialized: globalExists,
            dotDir,
            globalDotDir,
            projectDir: cwd,
        })
    } catch {
        return c.json({ initialized: false, stageInitialized: false, globalInitialized: false, dotDir, globalDotDir, projectDir: cwd })
    }
})

// ── DOT Init ────────────────────────────────────────────
dot.post('/api/dot/init', async (c) => {
    const { scope } = await c.req.json<{ scope?: string }>().catch(() => ({ scope: undefined }))
    const cwd = resolveCwd(resolveRequestWorkingDir(c), scope)
    try {
        await initRegistry(cwd)
        return c.json({ ok: true, dotDir: getDotDir(cwd), scope: scope || 'stage' })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Auth User ───────────────────────────────────────────
dot.get('/api/dot/auth-user', async (c) => {
    try {
        const auth = await readDotAuthUser()
        return c.json({
            authenticated: !!auth,
            username: auth?.username || null,
        })
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
        const result = await startDotLogin()
        return c.json({ ok: true, ...result })
    } catch (err: any) {
        return c.json({ error: err.message || 'Failed to start dot login.' }, 500)
    }
})

dot.post('/api/dot/logout', async (c) => {
    try {
        await clearDotAuthUser()
        return c.json({ ok: true })
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
    const { urn, localName, force, scope } = await c.req.json<{
        urn: string
        localName?: string
        force?: boolean
        scope?: 'global' | 'stage'
    }>()
    const cwd = resolveCwd(resolveRequestWorkingDir(c), scope)

    try {
        // Ensure .dance-of-tal exists
        await ensureDotDir(cwd)

        // Check if it's a performer (cascading install)
        if (urn.startsWith('performer/')) {
            const result = await installPerformerAndLock(cwd, urn, localName, force)
            invalidate('assets')
            return c.json({ ...result, scope: scope || 'stage' })
        }

        if (urn.startsWith('act/')) {
            const result = await installActWithDependencies(cwd, urn, force)
            invalidate('assets')
            return c.json({ ...result, scope: scope || 'stage' })
        }

        // Single asset install
        const result = await installAsset(cwd, urn, force)
        invalidate('assets')
        return c.json({ ...result, scope: scope || 'stage' })
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
        const auth = await readDotAuthUser()
        const author = body.author || auth?.username
        if (!author) {
            return c.json({ error: 'No author available. Sign in with `dot login` first.' }, 400)
        }

        const saved = await saveLocalStudioAsset({
            cwd,
            kind: body.kind,
            author,
            slug: body.slug,
            payload: body.payload,
        })
        invalidate('assets')
        return c.json({ ok: true, ...saved })
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
        const auth = await readDotAuthUser()
        if (!auth) {
            return c.json({ error: 'You are not logged in. Run `dot login` first.' }, 401)
        }

        const result = await publishStudioAsset({
            cwd,
            kind: body.kind,
            slug: body.slug,
            payload: body.payload,
            tags: body.tags,
            auth,
        })
        invalidate('assets')
        return c.json({ ok: true, ...result })
    } catch (err: any) {
        return c.json({ error: err.message }, 400)
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
