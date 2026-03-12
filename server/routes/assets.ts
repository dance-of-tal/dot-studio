// Asset Routes — using DOT lib directly

import { Hono } from 'hono'
import { cached, TTL } from '../lib/cache.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { getRegistryAssetDetail, getStudioAsset, listStudioAssets } from '../services/asset-service.js'

const assets = new Hono()

// ── Routes ──────────────────────────────────────────────
assets.get('/api/assets/:kind', async (c) => {
    const kind = c.req.param('kind')
    if (!['tal', 'dance', 'performer', 'act'].includes(kind)) {
        return c.json({ error: `Invalid kind: ${kind}` }, 400)
    }
    const cwd = resolveRequestWorkingDir(c)
    const assetList = await cached(`assets-${kind}-${cwd}`, TTL.ASSETS, () => listStudioAssets(cwd, kind))
    return c.json(assetList)
})

assets.get('/api/assets/:kind/:author/:name', async (c) => {
    const { kind, author, name } = c.req.param()
    try {
        return c.json(await getStudioAsset(resolveRequestWorkingDir(c), kind, author, name))
    } catch (err: any) {
        return c.json({ error: err.message }, 404)
    }
})

assets.get('/api/assets/registry/:kind/:author/:name', async (c) => {
    const { kind, author, name } = c.req.param()
    try {
        const detail = await cached(`registry-asset-${kind}-${author}-${name}`, TTL.PROVIDERS, () =>
            getRegistryAssetDetail(kind, author, name),
        )
        return c.json(detail)
    } catch (err: any) {
        return c.json({ error: err.message }, 404)
    }
})

export default assets
