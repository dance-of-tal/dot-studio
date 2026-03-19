import { Hono, type Context } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    parseSafeOwnerKind,
    readSafeOwnerSummary,
} from '../services/safe-service.js'

const safeSummary = new Hono()

function jsonError(c: Context, message: string, status = 400) {
    return c.json({ error: message }, { status: status as 400 | 500 })
}

safeSummary.get('/api/safe/:ownerKind/:ownerId', async (c) => {
    const ownerKind = parseSafeOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await readSafeOwnerSummary(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to load safe mode summary.', 500)
    }
})

export default safeSummary
