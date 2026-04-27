import { Hono } from 'hono'
import type { StudioAssetKind } from '../lib/dot-authoring.js'
import {
    installDotAsset,
    publishDotAsset,
    saveDotLocalAsset,
    uninstallDotAsset,
    previewUninstallDotAsset,
} from '../services/dot-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotAssets = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

function errorStatus(error: unknown) {
    return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
        ? error.status
        : undefined
}

dotAssets.post('/api/dot/install', async (c) => {
    const body = await c.req.json<{
        urn: string
        localName?: string
        force?: boolean
        scope?: 'global' | 'stage'
    }>()

    try {
        return c.json(await installDotAsset(requestWorkingDir(c), body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

dotAssets.put('/api/dot/assets/local', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        stage?: string
        author?: string
        payload: unknown
    }>().catch(() => null)

    if (!body?.kind || !body?.slug) {
        return jsonError(c, 'kind and slug are required.', 400)
    }

    try {
        return c.json(await saveDotLocalAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 400)
    }
})

dotAssets.post('/api/dot/assets/publish', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        stage?: string
        payload?: unknown
        tags?: string[]
        providedAssets?: Array<{
            kind: 'tal' | 'performer' | 'act'
            urn: string
            payload: Record<string, unknown>
            tags?: string[]
        }>
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
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), errorStatus(error) === 401 ? 401 : 400)
    }
})

dotAssets.delete('/api/dot/assets/local', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: 'tal' | 'dance' | 'performer' | 'act'
        urn: string
        cascade?: boolean
    }>().catch(() => null)

    if (!body?.kind || !body?.urn) {
        return jsonError(c, 'kind and urn are required.', 400)
    }

    try {
        return c.json(await uninstallDotAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
})

dotAssets.post('/api/dot/assets/uninstall-preview', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: 'tal' | 'dance' | 'performer' | 'act'
        urn: string
    }>().catch(() => null)

    if (!body?.kind || !body?.urn) {
        return jsonError(c, 'kind and urn are required.', 400)
    }

    try {
        return c.json(await previewUninstallDotAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
})

export default dotAssets
