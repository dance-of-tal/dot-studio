import { Hono } from 'hono'
import type { InstalledAssetKind } from '../../shared/asset-contracts.js'
import { cached, TTL } from '../lib/cache.js'
import { listStudioAssets } from '../services/asset-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const assetsCollection = new Hono()

assetsCollection.get('/api/assets/:kind', async (c) => {
    const kind = c.req.param('kind')
    if (!['tal', 'dance', 'performer', 'act'].includes(kind)) {
        return jsonError(c, `Invalid kind: ${kind}`, 400)
    }

    const cwd = requestWorkingDir(c)
    const assetKind = kind as InstalledAssetKind
    const assetList = await cached(`assets-${assetKind}-${cwd}`, TTL.ASSETS, () => listStudioAssets(cwd, assetKind))
    return c.json(assetList)
})

export default assetsCollection
