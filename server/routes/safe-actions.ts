import { Hono, type Context } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    applySafeOwnerSummary,
    discardAllSafeOwnerSummaryChanges,
    discardSafeOwnerSummaryFile,
    parseSafeOwnerKind,
    undoLastSafeOwnerSummaryApply,
} from '../services/safe-service.js'

const safeActions = new Hono()

function jsonError(c: Context, message: string, status = 400) {
    return c.json({ error: message }, { status: status as 400 | 500 })
}

safeActions.post('/api/safe/:ownerKind/:ownerId/apply', async (c) => {
    const ownerKind = parseSafeOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await applySafeOwnerSummary(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to apply safe mode changes.', 500)
    }
})

safeActions.post('/api/safe/:ownerKind/:ownerId/discard', async (c) => {
    const ownerKind = parseSafeOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    const body: { filePath?: string } = await c.req.json<{ filePath?: string }>().catch(() => ({}))
    if (!body.filePath || !body.filePath.trim()) {
        return jsonError(c, 'filePath is required.')
    }

    try {
        return c.json(await discardSafeOwnerSummaryFile(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
            body.filePath.trim(),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to discard the file.', 500)
    }
})

safeActions.post('/api/safe/:ownerKind/:ownerId/discard-all', async (c) => {
    const ownerKind = parseSafeOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await discardAllSafeOwnerSummaryChanges(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to discard pending changes.', 500)
    }
})

safeActions.post('/api/safe/:ownerKind/:ownerId/undo-last-apply', async (c) => {
    const ownerKind = parseSafeOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await undoLastSafeOwnerSummaryApply(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to undo the last apply.', 500)
    }
})

export default safeActions
