import { Hono, type Context } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    applySafeOwnerChanges,
    discardAllSafeOwnerChanges,
    discardSafeOwnerFile,
    getSafeOwnerSummary,
    undoLastSafeOwnerApply,
} from '../lib/safe-mode.js'
import type { SafeOwnerKind } from '../../shared/safe-mode.js'

const safe = new Hono()
const applyQueues = new Map<string, Promise<unknown>>()

function validateOwnerKind(value: string): SafeOwnerKind | null {
    return value === 'performer' || value === 'act' ? value : null
}

function jsonError(c: Context, message: string, status = 400) {
    return c.json({ error: message }, { status: status as 400 | 500 })
}

async function runQueued<T>(workingDir: string, task: () => Promise<T>) {
    const current = applyQueues.get(workingDir) || Promise.resolve()
    const next = current.catch(() => undefined).then(task)
    applyQueues.set(workingDir, next)
    try {
        return await next
    } finally {
        if (applyQueues.get(workingDir) === next) {
            applyQueues.delete(workingDir)
        }
    }
}

safe.get('/api/safe/:ownerKind/:ownerId', async (c) => {
    const ownerKind = validateOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await getSafeOwnerSummary(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to load safe mode summary.', 500)
    }
})

safe.post('/api/safe/:ownerKind/:ownerId/apply', async (c) => {
    const ownerKind = validateOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    const workingDir = resolveRequestWorkingDir(c)
    try {
        return c.json(await runQueued(workingDir, () => applySafeOwnerChanges(
            workingDir,
            ownerKind,
            c.req.param('ownerId'),
        )))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to apply safe mode changes.', 500)
    }
})

safe.post('/api/safe/:ownerKind/:ownerId/discard', async (c) => {
    const ownerKind = validateOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    const body: { filePath?: string } = await c.req.json<{ filePath?: string }>().catch(() => ({}))
    if (!body.filePath || !body.filePath.trim()) {
        return jsonError(c, 'filePath is required.')
    }

    try {
        return c.json(await discardSafeOwnerFile(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
            body.filePath.trim(),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to discard the file.', 500)
    }
})

safe.post('/api/safe/:ownerKind/:ownerId/discard-all', async (c) => {
    const ownerKind = validateOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await discardAllSafeOwnerChanges(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        ))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to discard pending changes.', 500)
    }
})

safe.post('/api/safe/:ownerKind/:ownerId/undo-last-apply', async (c) => {
    const ownerKind = validateOwnerKind(c.req.param('ownerKind'))
    if (!ownerKind) {
        return jsonError(c, 'Invalid owner kind.')
    }

    try {
        return c.json(await runQueued(resolveRequestWorkingDir(c), () => undoLastSafeOwnerApply(
            resolveRequestWorkingDir(c),
            ownerKind,
            c.req.param('ownerId'),
        )))
    } catch (error: any) {
        return jsonError(c, error?.message || 'Failed to undo the last apply.', 500)
    }
})

export default safe
