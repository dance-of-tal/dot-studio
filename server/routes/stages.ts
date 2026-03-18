// Stage CRUD Routes — with path validation

import { Hono } from 'hono'
import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { stagesDir } from '../lib/config.js'

const stages = new Hono()

// ── Helpers ─────────────────────────────────────────────
function sanitizeStageId(id: string): string {
    return id
        .replace(/\.\./g, '')
        .replace(/[/\\:*?"<>|\x00-\x1f]/g, '')
        .trim()
}

function validateStageId(id: string): string | null {
    const clean = sanitizeStageId(id)
    if (!clean || clean.length === 0) return null
    if (clean.length > 128) return null
    return clean
}

function normalizeWorkingDir(input: string): string | null {
    const trimmed = input.trim().replace(/\/+$/, '')
    if (!trimmed) return null
    return path.resolve(trimmed)
}

function stageIdForWorkingDir(workingDir: string): string {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 16)
}

function stagePathForId(id: string): string {
    return path.join(stagesDir(), `${id}.json`)
}

// ── List Stages ─────────────────────────────────────────
stages.get('/api/stages', async (c) => {
    const dir = stagesDir()
    try {
        await fs.mkdir(dir, { recursive: true })
        const files = await fs.readdir(dir)
        const entries = await Promise.all(
            files
                .filter((f: string) => f.endsWith('.json'))
                .map(async (file) => {
                    const filePath = path.join(dir, file)
                    try {
                        const [raw, stat] = await Promise.all([
                            fs.readFile(filePath, 'utf-8'),
                            fs.stat(filePath),
                        ])
                        const parsed = JSON.parse(raw)
                        const workingDir = normalizeWorkingDir(parsed.workingDir || '') || ''
                        if (!workingDir) {
                            return null
                        }
                        return {
                            id: file.replace('.json', ''),
                            workingDir,
                            updatedAt: stat.mtimeMs,
                        }
                    } catch {
                        return null
                    }
                })
        )

        return c.json(
            entries
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                .sort((a, b) => b.updatedAt - a.updatedAt)
        )
    } catch {
        return c.json([])
    }
})

// ── Get Stage ───────────────────────────────────────────
stages.get('/api/stages/:id', async (c) => {
    const rawId = c.req.param('id')
    const id = validateStageId(rawId)
    if (!id) return c.json({ error: 'Invalid stage id' }, 400)

    const filePath = stagePathForId(id)
    // Ensure resolved path is within stages dir (prevent traversal)
    if (!filePath.startsWith(stagesDir())) {
        return c.json({ error: 'Invalid stage id' }, 400)
    }

    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        return c.json(JSON.parse(raw))
    } catch {
        return c.json({ error: 'Stage not found' }, 404)
    }
})

// ── Save Stage ──────────────────────────────────────────
stages.put('/api/stages', async (c) => {
    const body = await c.req.json()
    const workingDir = normalizeWorkingDir(body.workingDir || '')
    if (!workingDir) {
        return c.json({ error: 'workingDir is required' }, 400)
    }

    const id = stageIdForWorkingDir(workingDir)
    const stage = {
        ...body,
        workingDir,
    }
    const dir = stagesDir()
    await fs.mkdir(dir, { recursive: true })

    const filePath = stagePathForId(id)
    if (!filePath.startsWith(dir)) {
        return c.json({ error: 'Invalid stage id' }, 400)
    }

    await fs.writeFile(filePath, JSON.stringify(stage, null, 2), 'utf-8')
    const stat = await fs.stat(filePath)

    // Project assistant agent whenever the stage is saved
    import('../services/studio-assistant/assistant-service.js').then(({ ensureAssistantAgent }) =>
        ensureAssistantAgent(workingDir).catch(() => {}),
    )

    return c.json({
        ok: true,
        id,
        workingDir,
        updatedAt: stat.mtimeMs,
    })
})

// ── Delete Stage ────────────────────────────────────────
stages.delete('/api/stages/:id', async (c) => {
    const rawId = c.req.param('id')
    const id = validateStageId(rawId)
    if (!id) return c.json({ error: 'Invalid stage id' }, 400)

    const filePath = stagePathForId(id)
    if (!filePath.startsWith(stagesDir())) {
        return c.json({ error: 'Invalid stage id' }, 400)
    }

    try {
        await fs.unlink(filePath)
        return c.json({ ok: true })
    } catch {
        return c.json({ error: 'Stage not found' }, 404)
    }
})

export default stages
