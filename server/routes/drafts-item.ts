import { Hono } from 'hono'
import {
    readDraft,
    updateDraft,
    deleteDraft,
} from '../services/draft-service.js'
import type { DraftAssetKind, UpdateDraftRequest } from '../../shared/draft-contracts.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const VALID_KINDS = new Set<DraftAssetKind>(['tal', 'dance', 'performer', 'act'])

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
    } catch (err: any) {
        return jsonError(c, err.message, 500)
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
    } catch (err: any) {
        return jsonError(c, err.message, 500)
    }
})

draftsItem.delete('/api/drafts/:kind/:id', async (c) => {
    const cwd = requestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return jsonError(c, `Invalid kind '${kind}'.`, 400)
    }

    try {
        const deleted = await deleteDraft(cwd, kind, id)
        if (!deleted) {
            return jsonError(c, 'Draft not found.', 404)
        }
        return c.json({ ok: true })
    } catch (err: any) {
        return jsonError(c, err.message, 500)
    }
})

export default draftsItem
