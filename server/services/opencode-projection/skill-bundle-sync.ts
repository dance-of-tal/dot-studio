import fs from 'fs/promises'
import path from 'path'

type SyncResult = {
    changed: boolean
    projectedFiles: string[]
}

type DirEntry = {
    name: string
    isDirectory(): boolean
}

async function readDirEntries(dirPath: string | null): Promise<DirEntry[]> {
    if (!dirPath) return []
    try {
        return await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
        return []
    }
}

async function buffersEqual(leftPath: string, rightPath: string) {
    const [left, right] = await Promise.all([
        fs.readFile(leftPath).catch(() => null),
        fs.readFile(rightPath).catch(() => null),
    ])
    if (!left || !right) return false
    if (left.length !== right.length) return false
    return left.every((value, index) => value === right[index])
}

async function ensureDirectory(dirPath: string) {
    const stat = await fs.stat(dirPath).catch(() => null)
    if (stat?.isDirectory()) {
        return false
    }
    if (stat) {
        await fs.rm(dirPath, { recursive: true, force: true })
    }
    await fs.mkdir(dirPath, { recursive: true })
    return true
}

async function syncFile(sourcePath: string, targetPath: string): Promise<SyncResult> {
    const parentChanged = await ensureDirectory(path.dirname(targetPath))
    const same = await buffersEqual(sourcePath, targetPath)
    if (same) {
        return { changed: parentChanged, projectedFiles: [targetPath] }
    }

    const targetStat = await fs.stat(targetPath).catch(() => null)
    if (targetStat?.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true })
    }

    await fs.copyFile(sourcePath, targetPath)
    return { changed: true, projectedFiles: [targetPath] }
}

async function syncDirectory(sourcePath: string, targetPath: string): Promise<SyncResult> {
    let changed = await ensureDirectory(targetPath)
    const projectedFiles: string[] = []

    const sourceEntries = await readDirEntries(sourcePath)
    const targetEntries = await readDirEntries(targetPath)
    const sourceNames = new Set(sourceEntries.map((entry) => entry.name))

    for (const entry of targetEntries) {
        if (!sourceNames.has(entry.name)) {
            await fs.rm(path.join(targetPath, entry.name), { recursive: true, force: true })
            changed = true
        }
    }

    for (const entry of sourceEntries) {
        const nextSource = path.join(sourcePath, entry.name)
        const nextTarget = path.join(targetPath, entry.name)
        const result = entry.isDirectory()
            ? await syncDirectory(nextSource, nextTarget)
            : await syncFile(nextSource, nextTarget)
        changed = result.changed || changed
        projectedFiles.push(...result.projectedFiles)
    }

    return { changed, projectedFiles }
}

export async function syncSkillBundleSiblings(
    sourceRoot: string | null,
    targetDir: string,
    options?: {
        excludedNames?: string[]
    },
): Promise<SyncResult> {
    const excludedNames = new Set(options?.excludedNames || ['SKILL.md'])
    let changed = false
    const projectedFiles: string[] = []

    const sourceEntries = (await readDirEntries(sourceRoot))
        .filter((entry) => !excludedNames.has(entry.name))
    const sourceNames = new Set(sourceEntries.map((entry) => entry.name))
    const targetEntries = (await readDirEntries(targetDir))
        .filter((entry) => !excludedNames.has(entry.name))

    for (const entry of targetEntries) {
        if (!sourceNames.has(entry.name)) {
            await fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true })
            changed = true
        }
    }

    for (const entry of sourceEntries) {
        const nextSource = path.join(sourceRoot!, entry.name)
        const nextTarget = path.join(targetDir, entry.name)
        const result = entry.isDirectory()
            ? await syncDirectory(nextSource, nextTarget)
            : await syncFile(nextSource, nextTarget)
        changed = result.changed || changed
        projectedFiles.push(...result.projectedFiles)
    }

    return { changed, projectedFiles }
}
