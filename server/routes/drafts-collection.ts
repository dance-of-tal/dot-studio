import { Hono } from 'hono'
import {
    createDraft,
    listDrafts,
} from '../services/draft-service.js'
import type { DraftAssetKind, CreateDraftRequest } from '../../shared/draft-contracts.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const VALID_KINDS = new Set<DraftAssetKind>(['tal', 'dance', 'performer', 'act'])

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

function isValidKind(kind: string): kind is DraftAssetKind {
    return VALID_KINDS.has(kind as DraftAssetKind)
}

const draftsCollection = new Hono()

draftsCollection.get('/api/drafts', async (c) => {
    const cwd = requestWorkingDir(c)
    const kind = c.req.query('kind')

    try {
        const result = await listDrafts(
            cwd,
            kind && isValidKind(kind) ? kind : undefined,
        )
        return c.json({ drafts: result })
    } catch {
        return c.json({ drafts: [] })
    }
})

draftsCollection.post('/api/drafts', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<CreateDraftRequest>().catch(() => null)

    if (!body?.kind || !body?.name) {
        return jsonError(c, 'kind and name are required.', 400)
    }
    if (!isValidKind(body.kind)) {
        return jsonError(c, `Invalid kind '${body.kind}'.`, 400)
    }

    try {
        const draft = await createDraft(cwd, body)
        return c.json({ draft }, 201)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

export default draftsCollection
