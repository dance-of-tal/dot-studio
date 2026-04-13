import { exec } from 'child_process'
import fs from 'fs/promises'
import open from 'open'
import path from 'path'
import { promisify } from 'util'
import { ensureDotDir } from '../lib/dot-source.js'
import {
    getActiveProjectDir,
    getExplicitActiveProjectDir,
    setActiveProjectDir,
    readStudioConfig,
    writeStudioConfig,
    type StudioConfig,
} from '../lib/config.js'
import { invalidateAll } from '../lib/cache.js'

const execAsync = promisify(exec)

export async function pickDirectory(prompt: string) {
    const escapedPrompt = String(prompt || 'Select Folder')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
    const { stdout } = await execAsync(`osascript -e 'POSIX path of (choose folder with prompt "${escapedPrompt}")'`)
    return { path: stdout.trim() }
}

export async function pickWorkingDirectory() {
    return pickDirectory('Select Working Directory for Workspace')
}

export async function getStudioConfig() {
    const config = await readStudioConfig()
    const activeProjectDir = getExplicitActiveProjectDir()
    return activeProjectDir
        ? { ...config, projectDir: activeProjectDir }
        : config
}

export async function updateStudioConfig(patch: Partial<StudioConfig>) {
    return writeStudioConfig(patch)
}

export async function activateStudioProject(workingDir: string) {
    if (!workingDir) {
        return { ok: false as const, status: 400, error: 'workingDir is required' }
    }

    const resolved = path.resolve(workingDir.replace(/\/+$/, ''))

    try {
        const stat = await fs.stat(resolved)
        if (!stat.isDirectory()) {
            return { ok: false as const, status: 400, error: 'workingDir is not a directory' }
        }
    } catch {
        return { ok: false as const, status: 400, error: `Directory not found: ${resolved}` }
    }

    await ensureDotDir(resolved)
    setActiveProjectDir(resolved)
    invalidateAll()

    import('./studio-assistant/assistant-service.js').then(({ ensureAssistantAgent }) =>
        ensureAssistantAgent(resolved).catch(() => {}),
    )

    return {
        ok: true as const,
        activeProjectDir: getActiveProjectDir(),
    }
}

export async function openStudioPath(targetPath: string) {
    if (!targetPath) {
        return { ok: false as const, status: 400, error: 'path is required' }
    }

    const resolved = path.resolve(targetPath.replace(/\/+$/, ''))

    try {
        await fs.stat(resolved)
    } catch {
        return { ok: false as const, status: 404, error: `Path not found: ${resolved}` }
    }

    try {
        await open(resolved)
        return {
            ok: true as const,
            path: resolved,
        }
    } catch (error) {
        return {
            ok: false as const,
            status: 500,
            error: error instanceof Error ? error.message : 'Failed to open path',
        }
    }
}
