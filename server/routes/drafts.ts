// Draft CRUD Routes — .dance-of-tal/drafts management

import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    createDraft,
    readDraft,
    listDrafts,
    updateDraft,
    deleteDraft,
} from '../services/draft-service.js'
import type { DraftAssetKind, CreateDraftRequest, UpdateDraftRequest } from '../../shared/draft-contracts.js'

const VALID_KINDS = new Set<DraftAssetKind>(['tal', 'dance', 'performer', 'act'])

function isValidKind(kind: string): kind is DraftAssetKind {
    return VALID_KINDS.has(kind as DraftAssetKind)
}

const drafts = new Hono()

// ── List drafts ─────────────────────────────────────────
drafts.get('/api/drafts', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const kind = c.req.query('kind')

    try {
        const result = await listDrafts(
            cwd,
            kind && isValidKind(kind) ? kind : undefined,
        )
        return c.json({ drafts: result })
    } catch (err: any) {
        return c.json({ drafts: [] })
    }
})

// ── Get single draft ────────────────────────────────────
drafts.get('/api/drafts/:kind/:id', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return c.json({ error: `Invalid kind '${kind}'.` }, 400)
    }

    try {
        const draft = await readDraft(cwd, kind, id)
        if (!draft) {
            return c.json({ error: 'Draft not found.' }, 404)
        }
        return c.json({ draft })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Create draft ────────────────────────────────────────
drafts.post('/api/drafts', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const body = await c.req.json<CreateDraftRequest>().catch(() => null)

    if (!body?.kind || !body?.name) {
        return c.json({ error: 'kind and name are required.' }, 400)
    }
    if (!isValidKind(body.kind)) {
        return c.json({ error: `Invalid kind '${body.kind}'.` }, 400)
    }

    try {
        const draft = await createDraft(cwd, body)
        return c.json({ draft }, 201)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Update draft ────────────────────────────────────────
drafts.put('/api/drafts/:kind/:id', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return c.json({ error: `Invalid kind '${kind}'.` }, 400)
    }

    const body = await c.req.json<UpdateDraftRequest>().catch(() => null)
    if (!body) {
        return c.json({ error: 'Request body is required.' }, 400)
    }

    try {
        const updated = await updateDraft(cwd, kind, id, body)
        if (!updated) {
            return c.json({ error: 'Draft not found.' }, 404)
        }
        return c.json({ draft: updated })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// ── Delete draft ────────────────────────────────────────
drafts.delete('/api/drafts/:kind/:id', async (c) => {
    const cwd = resolveRequestWorkingDir(c)
    const kind = c.req.param('kind')
    const id = c.req.param('id')

    if (!isValidKind(kind)) {
        return c.json({ error: `Invalid kind '${kind}'.` }, 400)
    }

    try {
        const deleted = await deleteDraft(cwd, kind, id)
        if (!deleted) {
            return c.json({ error: 'Draft not found.' }, 404)
        }
        return c.json({ ok: true })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

export default drafts
