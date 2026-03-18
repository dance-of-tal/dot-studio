// Stage CRUD Routes — with path validation

import { Hono } from 'hono'
import {
    deleteSavedStage,
    getSavedStage,
    listSavedStages,
    saveStageSnapshot,
} from '../services/stage-service.js'

const stages = new Hono()

// ── List Stages ─────────────────────────────────────────
stages.get('/api/stages', async (c) => {
    try {
        return c.json(await listSavedStages())
    } catch {
        return c.json([])
    }
})

// ── Get Stage ───────────────────────────────────────────
stages.get('/api/stages/:id', async (c) => {
    const result = await getSavedStage(c.req.param('id'))
    if (!result.ok) {
        return c.json({ error: result.error }, result.status as 400 | 404)
    }
    return c.json(result.stage)
})

// ── Save Stage ──────────────────────────────────────────
stages.put('/api/stages', async (c) => {
    const body = await c.req.json()
    const result = await saveStageSnapshot(body)
    if (!result.ok) {
        return c.json({ error: result.error }, result.status as 400)
    }
    return c.json(result)
})

// ── Delete Stage ────────────────────────────────────────
stages.delete('/api/stages/:id', async (c) => {
    const result = await deleteSavedStage(c.req.param('id'))
    if (!result.ok) {
        return c.json({ error: result.error }, result.status as 400 | 404)
    }
    return c.json(result)
})

export default stages
