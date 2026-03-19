import { Hono } from 'hono'
import type { StudioAssetKind } from '../lib/dot-authoring.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    installDotAsset,
    publishDotAsset,
    saveDotLocalAsset,
} from '../services/dot-service.js'
import { jsonError } from './route-errors.js'

const dotAssets = new Hono()

dotAssets.post('/api/dot/install', async (c) => {
    const body = await c.req.json<{
        urn: string
        localName?: string
        force?: boolean
        scope?: 'global' | 'stage'
    }>()

    try {
        return c.json(await installDotAsset(resolveRequestWorkingDir(c), body))
    } catch (err: any) {
        return jsonError(c, err.message, 500)
    }
})

dotAssets.put('/api/dot/assets/local', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        author?: string
        payload: unknown
    }>().catch(() => null)

    if (!body?.kind || !body?.slug) {
        return jsonError(c, 'kind and slug are required.', 400)
    }

    try {
        return c.json(await saveDotLocalAsset(cwd, body))
    } catch (err: any) {
        return jsonError(c, err.message, 400)
    }
})

dotAssets.post('/api/dot/assets/publish', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        payload?: unknown
        tags?: string[]
        acknowledgedTos?: boolean
    }>().catch(() => null)

    if (!body?.kind || !body?.slug) {
        return jsonError(c, 'kind and slug are required.', 400)
    }
    if (!body.acknowledgedTos) {
        return jsonError(c, 'Review and accept the Dance of Tal Terms of Service before publishing: https://danceoftal.com/tos', 400)
    }

    try {
        return c.json(await publishDotAsset(cwd, body))
    } catch (err: any) {
        return jsonError(c, err.message, err?.status === 401 ? 401 : 400)
    }
})

export default dotAssets
