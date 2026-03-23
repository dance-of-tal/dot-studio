import { Hono } from 'hono'
import {
    readDraft,
    updateDraft,
    deleteDraft,
    findDraftDependents,
} from '../services/draft-service.js'
import type { DraftAssetKind, UpdateDraftRequest } from '../../shared/draft-contracts.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const VALID_KINDS = new Set<DraftAssetKind>(['tal', 'dance', 'performer', 'act'])

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

function isValidKind(kind: string): kind is DraftAssetKind {
    return VALID_KINDS.has(kind as DraftAssetKind)
}

const draftsItem = new Hono()

draftsItem.get('/api/drafts/:kind/:id', async (c) => {
    const cwd = requestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return jsonError(c, `Invalid kind '${kind}'.`, 400)
    }

    try {
        const draft = await readDraft(cwd, kind, id)
        if (!draft) {
            return jsonError(c, 'Draft not found.', 404)
        }
        return c.json({ draft })
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

draftsItem.put('/api/drafts/:kind/:id', async (c) => {
    const cwd = requestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return jsonError(c, `Invalid kind '${kind}'.`, 400)
    }

    const body = await c.req.json<UpdateDraftRequest>().catch(() => null)
    if (!body) {
        return jsonError(c, 'Request body is required.', 400)
    }

    try {
        const updated = await updateDraft(cwd, kind, id, body)
        if (!updated) {
            return jsonError(c, 'Draft not found.', 404)
        }
        return c.json({ draft: updated })
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

draftsItem.post('/api/drafts/delete-preview/:kind/:id', async (c) => {
    const cwd = requestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return jsonError(c, `Invalid kind '${kind}'.`, 400)
    }

    try {
        const plan = await findDraftDependents(cwd, kind, id)
        return c.json(plan)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
})

draftsItem.delete('/api/drafts/:kind/:id', async (c) => {
    const cwd = requestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return jsonError(c, `Invalid kind '${kind}'.`, 400)
    }

    const body = await c.req.json<{ cascade?: boolean }>().catch(() => ({} as { cascade?: boolean }))

    try {
        const deleted = await deleteDraft(cwd, kind, id, body.cascade)
        if (!deleted.ok) {
            return jsonError(c, 'Draft not found.', 404)
        }
        return c.json(deleted)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

export default draftsItem
