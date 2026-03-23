import { Hono, type Context } from 'hono'
import { cached, TTL } from '../lib/cache.js'
import { getRegistryAssetDetail, getStudioAsset } from '../services/asset-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const assetsDetail = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

function assetPathFromRequest(c: Context) {
    return c.req.query('path') || c.req.param('name') || ''
}

async function handleStudioAssetDetail(c: Context) {
    const { kind, author } = c.req.param()
    const assetPath = assetPathFromRequest(c)
    try {
        return c.json(await getStudioAsset(requestWorkingDir(c), kind, author, assetPath))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
}

async function handleRegistryAssetDetail(c: Context) {
    const { kind, author } = c.req.param()
    const assetPath = assetPathFromRequest(c)
    const cwd = requestWorkingDir(c)
    try {
        const detail = await cached(`registry-asset-${cwd}-${kind}-${author}-${assetPath}`, TTL.PROVIDERS, () =>
            getRegistryAssetDetail(cwd, kind, author, assetPath),
        )
        return c.json(detail)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
}

assetsDetail.get('/api/assets/:kind/:author', handleStudioAssetDetail)
assetsDetail.get('/api/assets/:kind/:author/:name', handleStudioAssetDetail)
assetsDetail.get('/api/assets/registry/:kind/:author', handleRegistryAssetDetail)
assetsDetail.get('/api/assets/registry/:kind/:author/:name', handleRegistryAssetDetail)

export default assetsDetail
