// Health, Studio Config & Activation Routes

import { Hono } from 'hono'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import {
    getActiveProjectDir, setActiveProjectDir,
    readStudioConfig, writeStudioConfig,
    type StudioConfig,
} from '../lib/config.js'
import { invalidateAll } from '../lib/cache.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'

const execAsync = promisify(exec)

const health = new Hono()

// ── Health ───────────────────────────────────────────────
health.get('/api/health', (c) => c.json({ ok: true, project: resolveRequestWorkingDir(c) }))

// ── Pick Directory (macOS) ──────────────────────────────
health.get('/api/studio/pick-directory', async (c) => {
    try {
        const { stdout } = await execAsync(`osascript -e 'POSIX path of (choose folder with prompt "Select Working Directory for Stage")'`)
        return c.json({ path: stdout.trim() })
    } catch {
        return c.json({ error: 'Selection cancelled or failed' }, 400)
    }
})

// ── Studio Config ───────────────────────────────────────
health.get('/api/studio/config', async (c) => {
    const config = await readStudioConfig()
    return c.json({ ...config, projectDir: resolveRequestWorkingDir(c) })
})

health.put('/api/studio/config', async (c) => {
    const body = await c.req.json<Partial<StudioConfig>>()
    const merged = await writeStudioConfig(body)
    return c.json(merged)
})

health.post('/api/studio/activate', async (c) => {
    const { workingDir } = await c.req.json<{ workingDir: string }>()
    if (!workingDir) {
        return c.json({ error: 'workingDir is required' }, 400)
    }

    // Normalize: resolve, trim trailing slashes
    const resolved = path.resolve(workingDir.replace(/\/+$/, ''))

    // Verify directory exists
    try {
        const stat = await fs.stat(resolved)
        if (!stat.isDirectory()) {
            return c.json({ error: 'workingDir is not a directory' }, 400)
        }
    } catch {
        return c.json({ error: `Directory not found: ${resolved}` }, 400)
    }

    setActiveProjectDir(resolved)
    invalidateAll()  // flush all caches — assets, models, MCP are project-scoped
    console.log(`🎯 Active project dir switched to: ${getActiveProjectDir()}`)
    return c.json({ ok: true, activeProjectDir: getActiveProjectDir() })
})

export default health
