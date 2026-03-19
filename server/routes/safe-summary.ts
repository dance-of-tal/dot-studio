import { Hono } from 'hono'
import {
    parseSafeOwnerKind,
    readSafeOwnerSummary,
} from '../services/safe-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const safeSummary = new Hono()

safeSummary.get('/api/safe/:ownerKind/:ownerId', async (c) => {
    const ownerKind = parseSafeOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await readSafeOwnerSummary(
            requestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to load safe mode summary.', 500)
    }
})

export default safeSummary
