import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { stagesDir } from '../lib/config.js'

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

export async function listSavedStages() {
    const dir = stagesDir()
    await fs.mkdir(dir, { recursive: true })
    const files = await fs.readdir(dir)
    const entries = await Promise.all(
        files
            .filter((file) => file.endsWith('.json'))
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
            }),
    )

    return entries
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getSavedStage(rawId: string) {
    const id = validateStageId(rawId)
    if (!id) {
        return { ok: false as const, status: 400, error: 'Invalid stage id' }
    }

    const filePath = stagePathForId(id)
    if (!filePath.startsWith(stagesDir())) {
        return { ok: false as const, status: 400, error: 'Invalid stage id' }
    }

    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        return { ok: true as const, stage: JSON.parse(raw) }
    } catch {
        return { ok: false as const, status: 404, error: 'Stage not found' }
    }
}

export async function saveStageSnapshot(body: any) {
    const workingDir = normalizeWorkingDir(body.workingDir || '')
    if (!workingDir) {
        return { ok: false as const, status: 400, error: 'workingDir is required' }
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
        return { ok: false as const, status: 400, error: 'Invalid stage id' }
    }

    await fs.writeFile(filePath, JSON.stringify(stage, null, 2), 'utf-8')
    const stat = await fs.stat(filePath)

    import('./studio-assistant/assistant-service.js').then(({ ensureAssistantAgent }) =>
        ensureAssistantAgent(workingDir).catch(() => {}),
    )

    return {
        ok: true as const,
        id,
        workingDir,
        updatedAt: stat.mtimeMs,
    }
}

export async function deleteSavedStage(rawId: string) {
    const id = validateStageId(rawId)
    if (!id) {
        return { ok: false as const, status: 400, error: 'Invalid stage id' }
    }

    const filePath = stagePathForId(id)
    if (!filePath.startsWith(stagesDir())) {
        return { ok: false as const, status: 400, error: 'Invalid stage id' }
    }

    try {
        await fs.unlink(filePath)
        return { ok: true as const }
    } catch {
        return { ok: false as const, status: 404, error: 'Stage not found' }
    }
}
