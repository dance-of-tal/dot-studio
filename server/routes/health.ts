// Health, Studio Config & Activation Routes

import { Hono } from 'hono'
import type { StudioConfig } from '../lib/config.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import {
    activateStudioProject,
    getStudioConfig,
    pickWorkingDirectory,
    updateStudioConfig,
} from '../services/studio-service.js'

const health = new Hono()

// ── Health ───────────────────────────────────────────────
health.get('/api/health', (c) => c.json({ ok: true, project: resolveRequestWorkingDir(c) }))

// ── Pick Directory (macOS) ──────────────────────────────
health.get('/api/studio/pick-directory', async (c) => {
    try {
        return c.json(await pickWorkingDirectory())
    } catch {
        return c.json({ error: 'Selection cancelled or failed' }, 400)
    }
})

// ── Studio Config ───────────────────────────────────────
health.get('/api/studio/config', async (c) => {
    return c.json(await getStudioConfig(resolveRequestWorkingDir(c)))
})

health.put('/api/studio/config', async (c) => {
    const body = await c.req.json<Partial<StudioConfig>>()
    return c.json(await updateStudioConfig(body))
})

health.post('/api/studio/activate', async (c) => {
    const { workingDir } = await c.req.json<{ workingDir: string }>()
    const result = await activateStudioProject(workingDir)
    if (!result.ok) {
        return c.json({ error: result.error }, result.status as 400)
    }
    return c.json(result)
})

export default health
