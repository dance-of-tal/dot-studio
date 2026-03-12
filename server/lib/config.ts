// Server Configuration & Studio Config Helpers

import fs from 'fs/promises'
import path from 'path'
import os from 'os'

function resolvePort(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value || '', 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resolveDefaultProjectDir() {
    if (process.env.PROJECT_DIR) {
        return path.resolve(process.env.PROJECT_DIR)
    }

    if (process.env.DOT_STUDIO_PRODUCTION === '1') {
        return path.resolve(process.cwd())
    }

    return path.resolve(process.cwd(), '..')
}

// ── Constants ───────────────────────────────────────────
export const PORT = resolvePort(process.env.PORT, 3001)
export const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4096'
export const OPENCODE_MANAGED = !process.env.OPENCODE_URL
export const DEFAULT_PROJECT_DIR = resolveDefaultProjectDir()
export const STUDIO_DIR = process.env.STUDIO_DIR || path.join(os.homedir(), '.dot-studio')
export const STUDIO_CONFIG_PATH = path.join(STUDIO_DIR, 'studio-config.json')
export const IS_PRODUCTION = process.env.DOT_STUDIO_PRODUCTION === '1'

// ── Mutable Active Project Dir ──────────────────────────
let _activeProjectDir = DEFAULT_PROJECT_DIR

export function getActiveProjectDir(): string {
    return _activeProjectDir
}

export function setActiveProjectDir(dir: string): void {
    _activeProjectDir = dir
}

// ── Studio Config ───────────────────────────────────────
export interface StudioConfig {
    theme?: 'light' | 'dark'
    lastStage?: string
}

export async function readStudioConfig(): Promise<StudioConfig> {
    try {
        const raw = await fs.readFile(STUDIO_CONFIG_PATH, 'utf-8')
        return JSON.parse(raw)
    } catch {
        return {}
    }
}

export async function writeStudioConfig(partial: Partial<StudioConfig>): Promise<StudioConfig> {
    await fs.mkdir(STUDIO_DIR, { recursive: true })
    const current = await readStudioConfig()
    const merged = { ...current, ...partial }
    await fs.writeFile(STUDIO_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
    return merged
}

// ── Stages Dir ──────────────────────────────────────────
export function stagesDir(): string {
    return path.join(STUDIO_DIR, 'stages')
}
