import { Hono } from 'hono'
import {
    parseSafeOwnerKind,
    readSafeOwnerSummary,
} from '../services/safe-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const safeSummary = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error && error.message ? error.message : 'Failed to load safe mode summary.'
}

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
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

export default safeSummary
