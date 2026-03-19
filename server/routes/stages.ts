// Stage CRUD Routes — with path validation

import { Hono } from 'hono'
import {
    deleteSavedStage,
    getSavedStage,
    listSavedStages,
    saveStageSnapshot,
    setSavedStageHidden,
} from '../services/stage-service.js'
import { jsonServiceFailure } from './route-errors.js'

const stages = new Hono()

// ── List Stages ─────────────────────────────────────────
stages.get('/api/stages', async (c) => {
    try {
        return c.json(await listSavedStages(c.req.query('includeHidden') === '1'))
    } catch {
        return c.json([])
    }
})

// ── Get Stage ───────────────────────────────────────────
stages.get('/api/stages/:id', async (c) => {
    const result = await getSavedStage(c.req.param('id'))
    if (!result.ok) {
        return jsonServiceFailure(c, result)
    }
    return c.json(result.stage)
})

// ── Save Stage ──────────────────────────────────────────
stages.put('/api/stages', async (c) => {
    const body = await c.req.json()
    const result = await saveStageSnapshot(body)
    if (!result.ok) {
        return jsonServiceFailure(c, result)
    }
    return c.json(result)
})

stages.patch('/api/stages/:id', async (c) => {
    const body = await c.req.json<{ hiddenFromList?: boolean }>().catch((): { hiddenFromList?: boolean } => ({}))
    const result = await setSavedStageHidden(c.req.param('id'), body.hiddenFromList === true)
    if (!result.ok) {
        return jsonServiceFailure(c, result)
    }
    return c.json(result)
})

// ── Delete Stage ────────────────────────────────────────
stages.delete('/api/stages/:id', async (c) => {
    const result = await deleteSavedStage(c.req.param('id'))
    if (!result.ok) {
        return jsonServiceFailure(c, result)
    }
    return c.json(result)
})

export default stages
