import fs from 'fs/promises'
import { resolve } from 'path'

export async function validateExistingProjectDir(projectDir: string) {
    const resolvedProjectDir = resolve(projectDir)
    const stat = await fs.stat(resolvedProjectDir).catch(() => null)
    if (!stat) {
        throw new Error(`Directory not found: ${resolvedProjectDir}`)
    }
    if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${resolvedProjectDir}`)
    }
    return resolvedProjectDir
}

export async function ensureOpenProjectDir(projectDir: string) {
    const resolvedProjectDir = resolve(projectDir)
    const stat = await fs.stat(resolvedProjectDir).catch(() => null)
    if (!stat) {
        await fs.mkdir(resolvedProjectDir, { recursive: true })
        return resolvedProjectDir
    }
    if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${resolvedProjectDir}`)
    }
    return resolvedProjectDir
}

export function buildOpencodeProjectCheckUrl(url: string, projectDir: string) {
    const target = new URL('/project', url)
    target.searchParams.set('directory', projectDir)
    return target
}
