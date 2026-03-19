import { Hono } from 'hono'
import { cached, TTL } from '../lib/cache.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { listStudioAssets } from '../services/asset-service.js'
import { jsonError } from './route-errors.js'

const assetsCollection = new Hono()

assetsCollection.get('/api/assets/:kind', async (c) => {
    const kind = c.req.param('kind')
    if (!['tal', 'dance', 'performer', 'act'].includes(kind)) {
        return jsonError(c, `Invalid kind: ${kind}`, 400)
    }

    const cwd = resolveRequestWorkingDir(c)
    const assetList = await cached(`assets-${kind}-${cwd}`, TTL.ASSETS, () => listStudioAssets(cwd, kind))
    return c.json(assetList)
})

export default assetsCollection
