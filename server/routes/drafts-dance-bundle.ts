/**
 * drafts-dance-bundle.ts — Routes for Dance bundle file operations.
 *
 * These endpoints operate on files within a bundle-backed Dance draft directory.
 * Generic draft CRUD (create/read/update/delete/list) is in drafts-collection.ts / drafts-item.ts.
 */

import { Hono } from 'hono'
import {
    getDanceBundleTree,
    readDanceBundleFile,
    writeDanceBundleFile,
    createDanceBundleFile,
    deleteDanceBundleFile,
    isDanceBundleDraft,
} from '../services/dance-bundle-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const draftsDanceBundle = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

// ── Tree ────────────────────────────────────────────────

draftsDanceBundle.get('/api/drafts/dance/:id/tree', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')

    if (!await isDanceBundleDraft(cwd, id)) {
        return jsonError(c, 'Dance bundle draft not found.', 404)
    }

    try {
        const tree = await getDanceBundleTree(cwd, id)
        return c.json({ tree })
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

// ── Read file ───────────────────────────────────────────

draftsDanceBundle.get('/api/drafts/dance/:id/file', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const filePath = c.req.query('path')

    if (!filePath) {
        return jsonError(c, 'path query parameter is required.', 400)
    }
    if (!await isDanceBundleDraft(cwd, id)) {
        return jsonError(c, 'Dance bundle draft not found.', 404)
    }

    try {
        const content = await readDanceBundleFile(cwd, id, filePath)
        return c.json({ path: filePath, content })
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('not allowed') || msg.includes('not permitted') ? 400 : msg.includes('not found') ? 404 : 500
        return jsonError(c, msg, status as 400 | 404 | 500)
    }
})

// ── Write file ──────────────────────────────────────────

draftsDanceBundle.put('/api/drafts/dance/:id/file', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const body = await c.req.json<{ path: string; content: string }>().catch(() => null)

    if (!body?.path || typeof body.content !== 'string') {
        return jsonError(c, 'path and content are required.', 400)
    }
    if (!await isDanceBundleDraft(cwd, id)) {
        return jsonError(c, 'Dance bundle draft not found.', 404)
    }

    try {
        await writeDanceBundleFile(cwd, id, body.path, body.content)
        return c.json({ ok: true, path: body.path })
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('not allowed') || msg.includes('not permitted') ? 400 : 500
        return jsonError(c, msg, status as 400 | 500)
    }
})

// ── Create file/directory ───────────────────────────────

draftsDanceBundle.post('/api/drafts/dance/:id/files', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const body = await c.req.json<{ path: string; isDirectory?: boolean }>().catch(() => null)

    if (!body?.path) {
        return jsonError(c, 'path is required.', 400)
    }
    if (!await isDanceBundleDraft(cwd, id)) {
        return jsonError(c, 'Dance bundle draft not found.', 404)
    }

    try {
        await createDanceBundleFile(cwd, id, body.path, body.isDirectory)
        return c.json({ ok: true, path: body.path }, 201)
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('already exists') ? 400 : msg.includes('not allowed') ? 400 : 500
        return jsonError(c, msg, status as 400 | 500)
    }
})

// ── Delete file ─────────────────────────────────────────

draftsDanceBundle.delete('/api/drafts/dance/:id/file', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const body = await c.req.json<{ path: string }>().catch(() => null)

    if (!body?.path) {
        return jsonError(c, 'path is required.', 400)
    }
    if (!await isDanceBundleDraft(cwd, id)) {
        return jsonError(c, 'Dance bundle draft not found.', 404)
    }

    try {
        await deleteDanceBundleFile(cwd, id, body.path)
        return c.json({ ok: true, path: body.path })
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('Cannot delete') ? 400 : msg.includes('not allowed') ? 400 : 500
        return jsonError(c, msg, status as 400 | 500)
    }
})

export default draftsDanceBundle
