import { Hono } from 'hono'
import { cached, TTL } from '../lib/cache.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { getRegistryAssetDetail, getStudioAsset } from '../services/asset-service.js'
import { jsonError } from './route-errors.js'

const assetsDetail = new Hono()

assetsDetail.get('/api/assets/:kind/:author/:name', async (c) => {
    const { kind, author, name } = c.req.param()
    try {
        return c.json(await getStudioAsset(resolveRequestWorkingDir(c), kind, author, name))
    } catch (err: any) {
        return jsonError(c, err.message, 404)
    }
})

assetsDetail.get('/api/assets/registry/:kind/:author/:name', async (c) => {
    const { kind, author, name } = c.req.param()
    try {
        const detail = await cached(`registry-asset-${kind}-${author}-${name}`, TTL.PROVIDERS, () =>
            getRegistryAssetDetail(kind, author, name),
        )
        return c.json(detail)
    } catch (err: any) {
        return jsonError(c, err.message, 404)
    }
})

export default assetsDetail
