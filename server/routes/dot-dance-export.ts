import { Hono } from 'hono'
import { exportDanceBundle } from '../services/dance-export-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const dotDanceExport = new Hono()

dotDanceExport.post('/api/dot/dance-export', async (c) => {
    const body = await c.req.json<{
        draftId: string
        slug: string
        destinationParentPath: string
        overwrite?: boolean
    }>().catch(() => null)

    if (!body?.draftId || !body?.slug || !body?.destinationParentPath) {
        return jsonError(c, 'draftId, slug, and destinationParentPath are required.', 400)
    }

    try {
        return c.json(await exportDanceBundle({
            cwd: requestWorkingDir(c),
            draftId: body.draftId,
            slugInput: body.slug,
            destinationParentPath: body.destinationParentPath,
            overwrite: body.overwrite,
        }))
    } catch (error) {
        return jsonError(c, error instanceof Error ? error.message : 'Failed to export dance bundle.', 400)
    }
})

export default dotDanceExport
