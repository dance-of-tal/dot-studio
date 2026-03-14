import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { STUDIO_DIR } from './config.js'
import type {
    ExecutionMode,
    SafeOwnerFile,
    SafeOwnerKind,
    SafeOwnerSummary,
} from '../../shared/safe-mode.js'

const execFileAsync = promisify(execFile)
const SAFE_MODE_ROOT = path.join(STUDIO_DIR, 'safe-mode')
const IGNORED_ENTRY_NAMES = new Set(['.git', '.dot-studio', 'node_modules'])

type ApplyTransactionFile = {
    path: string
    beforeExists: boolean
    beforeContentBase64: string | null
    afterHash: string
}

type SafeOwnerMeta = {
    version: 1
    workingDir: string
    ownerKind: SafeOwnerKind
    ownerId: string
    shadowDir: string
    baseDir: string
    conflicts: Record<string, { reason: string }>
    lastApply: {
        id: string
        createdAt: number
        files: ApplyTransactionFile[]
    } | null
    updatedAt: number
}

function hashString(value: string) {
    return createHash('sha1').update(value).digest('hex')
}

function ownerStorageKey(workingDir: string, ownerKind: SafeOwnerKind, ownerId: string) {
    return hashString(`${workingDir}:${ownerKind}:${ownerId}`).slice(0, 24)
}

function ownerRoot(workingDir: string, ownerKind: SafeOwnerKind, ownerId: string) {
    return path.join(SAFE_MODE_ROOT, 'owners', ownerStorageKey(workingDir, ownerKind, ownerId))
}

function ownerMetaPath(workingDir: string, ownerKind: SafeOwnerKind, ownerId: string) {
    return path.join(ownerRoot(workingDir, ownerKind, ownerId), 'meta.json')
}

function ownerShadowDir(workingDir: string, ownerKind: SafeOwnerKind, ownerId: string) {
    return path.join(ownerRoot(workingDir, ownerKind, ownerId), 'workspace')
}

function ownerBaseDir(workingDir: string, ownerKind: SafeOwnerKind, ownerId: string) {
    return path.join(ownerRoot(workingDir, ownerKind, ownerId), 'base')
}

function normalizeRelativePath(value: string) {
    const normalized = path.posix.normalize(value.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (!normalized || normalized === '.' || normalized.startsWith('../')) {
        throw new Error('Invalid file path.')
    }
    return normalized
}

async function readMeta(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
): Promise<SafeOwnerMeta | null> {
    try {
        const raw = await fs.readFile(ownerMetaPath(workingDir, ownerKind, ownerId), 'utf-8')
        const parsed = JSON.parse(raw) as SafeOwnerMeta
        if (parsed?.workingDir !== workingDir || parsed?.ownerKind !== ownerKind || parsed?.ownerId !== ownerId) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

async function writeMeta(meta: SafeOwnerMeta) {
    await fs.mkdir(path.dirname(ownerMetaPath(meta.workingDir, meta.ownerKind, meta.ownerId)), { recursive: true })
    meta.updatedAt = Date.now()
    await fs.writeFile(
        ownerMetaPath(meta.workingDir, meta.ownerKind, meta.ownerId),
        JSON.stringify(meta, null, 2),
        'utf-8',
    )
}

async function runGit(
    cwd: string,
    args: string[],
    options?: { allowExitCodes?: number[] },
) {
    try {
        const { stdout } = await execFileAsync('git', args, { cwd })
        return stdout
    } catch (error: any) {
        if (options?.allowExitCodes?.includes(error?.code)) {
            return error?.stdout || ''
        }
        throw error
    }
}

async function removeGitMetadata(dir: string) {
    await fs.rm(path.join(dir, '.git'), { recursive: true, force: true })
}

async function initializeGitWorkspace(dir: string) {
    await removeGitMetadata(dir)
    await runGit(dir, ['init', '-q'])
    await runGit(dir, ['add', '-A'])
    await runGit(dir, [
        '-c', 'user.name=DOT Studio',
        '-c', 'user.email=studio@local',
        'commit',
        '--allow-empty',
        '-qm',
        'DOT Studio safe mode baseline',
    ])
}

async function copyWorkspaceSnapshot(
    sourceDir: string,
    targetDir: string,
    options: { symlinkNodeModules: boolean },
) {
    await fs.rm(targetDir, { recursive: true, force: true })
    await fs.mkdir(targetDir, { recursive: true })
    const entries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
        if (entry.name === '.git' || entry.name === '.dot-studio' || entry.name === '.opencode') {
            continue
        }
        const sourcePath = path.join(sourceDir, entry.name)
        const targetPath = path.join(targetDir, entry.name)

        if (entry.name === 'node_modules') {
            if (options.symlinkNodeModules) {
                await fs.symlink(sourcePath, targetPath, 'dir').catch(async () => {
                    await fs.cp(sourcePath, targetPath, { recursive: true, dereference: false })
                })
            }
            continue
        }

        await fs.cp(sourcePath, targetPath, { recursive: true, dereference: false })
    }
}

function isBinaryBuffer(buffer: Buffer | null) {
    return !!buffer && buffer.includes(0)
}

function hashBuffer(buffer: Buffer | null) {
    return buffer ? createHash('sha1').update(buffer).digest('hex') : 'missing'
}

function buffersEqual(left: Buffer | null, right: Buffer | null) {
    if (left === null || right === null) {
        return left === right
    }
    return left.equals(right)
}

async function readBuffer(filePath: string) {
    try {
        return await fs.readFile(filePath)
    } catch {
        return null
    }
}

async function writeBuffer(filePath: string, buffer: Buffer | null) {
    if (buffer === null) {
        await fs.rm(filePath, { force: true })
        return
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, buffer)
}

async function listRelativeFiles(dir: string, root = dir, acc: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (IGNORED_ENTRY_NAMES.has(entry.name)) {
            continue
        }
        const fullPath = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) {
            continue
        }
        if (entry.isDirectory()) {
            await listRelativeFiles(fullPath, root, acc)
            continue
        }
        acc.push(normalizeRelativePath(path.relative(root, fullPath)))
    }
    return acc
}

async function buildUnifiedDiff(
    relPath: string,
    basePath: string,
    shadowPath: string,
    baseBuffer: Buffer | null,
    shadowBuffer: Buffer | null,
) {
    if (isBinaryBuffer(baseBuffer) || isBinaryBuffer(shadowBuffer)) {
        return `Binary file changed: ${relPath}`
    }

    const leftPath = baseBuffer === null ? '/dev/null' : basePath
    const rightPath = shadowBuffer === null ? '/dev/null' : shadowPath
    const ownerRootPath = path.dirname(path.dirname(basePath))
    const leftRelativePath = leftPath === '/dev/null'
        ? '/dev/null'
        : normalizeRelativePath(path.relative(ownerRootPath, leftPath))
    const rightRelativePath = rightPath === '/dev/null'
        ? '/dev/null'
        : normalizeRelativePath(path.relative(ownerRootPath, rightPath))
    const args = [
        'diff',
        '--no-index',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        '--',
        leftRelativePath,
        rightRelativePath,
    ]
    const stdout = await runGit(ownerRootPath, args, { allowExitCodes: [1] })
    if (!stdout) {
        return `diff -- ${relPath}\n`
    }

    return stdout
        .replaceAll(`a/${leftRelativePath}`, `a/${relPath}`)
        .replaceAll(`b/${rightRelativePath}`, `b/${relPath}`)
}

async function collectPendingFiles(meta: SafeOwnerMeta): Promise<SafeOwnerFile[]> {
    const baseFiles = await listRelativeFiles(meta.baseDir)
    const shadowFiles = await listRelativeFiles(meta.shadowDir)
    const filePaths = Array.from(new Set([...baseFiles, ...shadowFiles])).sort((left, right) => left.localeCompare(right))
    const files: SafeOwnerFile[] = []

    for (const relPath of filePaths) {
        const basePath = path.join(meta.baseDir, relPath)
        const shadowPath = path.join(meta.shadowDir, relPath)
        const [baseBuffer, shadowBuffer] = await Promise.all([
            readBuffer(basePath),
            readBuffer(shadowPath),
        ])

        if (buffersEqual(baseBuffer, shadowBuffer)) {
            continue
        }

        files.push({
            path: relPath,
            status: baseBuffer === null ? 'added' : shadowBuffer === null ? 'deleted' : 'modified',
            conflict: !!meta.conflicts[relPath],
            diff: await buildUnifiedDiff(relPath, basePath, shadowPath, baseBuffer, shadowBuffer),
        })
    }

    return files
}

async function canUndoLastApply(meta: SafeOwnerMeta) {
    if (!meta.lastApply || meta.lastApply.files.length === 0) {
        return false
    }

    for (const file of meta.lastApply.files) {
        const currentBuffer = await readBuffer(path.join(meta.workingDir, file.path))
        if (hashBuffer(currentBuffer) !== file.afterHash) {
            return false
        }
    }
    return true
}

async function buildSummary(meta: SafeOwnerMeta): Promise<SafeOwnerSummary> {
    const files = await collectPendingFiles(meta)
    return {
        ownerKind: meta.ownerKind,
        ownerId: meta.ownerId,
        mode: 'safe',
        pendingCount: files.length,
        conflictCount: files.filter((file) => file.conflict).length,
        files,
        canUndoLastApply: await canUndoLastApply(meta),
    }
}

async function rebuildOwnerWorkspace(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    const shadowDir = ownerShadowDir(workingDir, ownerKind, ownerId)
    const baseDir = ownerBaseDir(workingDir, ownerKind, ownerId)
    await copyWorkspaceSnapshot(workingDir, shadowDir, { symlinkNodeModules: true })
    await copyWorkspaceSnapshot(workingDir, baseDir, { symlinkNodeModules: false })
    await initializeGitWorkspace(shadowDir)

    const meta: SafeOwnerMeta = {
        version: 1,
        workingDir,
        ownerKind,
        ownerId,
        shadowDir,
        baseDir,
        conflicts: {},
        lastApply: null,
        updatedAt: Date.now(),
    }
    await writeMeta(meta)
    return meta
}

export async function ensureSafeOwnerWorkspace(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    const existing = await readMeta(workingDir, ownerKind, ownerId)
    if (!existing) {
        return rebuildOwnerWorkspace(workingDir, ownerKind, ownerId)
    }

    const [shadowStat, baseStat] = await Promise.all([
        fs.stat(existing.shadowDir).catch(() => null),
        fs.stat(existing.baseDir).catch(() => null),
    ])
    if (!shadowStat?.isDirectory() || !baseStat?.isDirectory()) {
        return rebuildOwnerWorkspace(workingDir, ownerKind, ownerId)
    }

    return existing
}

export async function getSafeOwnerSummary(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    const meta = await ensureSafeOwnerWorkspace(workingDir, ownerKind, ownerId)
    return buildSummary(meta)
}

async function mergeTextBuffers(
    ours: Buffer,
    base: Buffer,
    theirs: Buffer,
) {
    const tempRoot = await fs.mkdtemp(path.join(SAFE_MODE_ROOT, 'merge-'))
    const oursPath = path.join(tempRoot, 'ours')
    const basePath = path.join(tempRoot, 'base')
    const theirsPath = path.join(tempRoot, 'theirs')
    await Promise.all([
        fs.writeFile(oursPath, ours),
        fs.writeFile(basePath, base),
        fs.writeFile(theirsPath, theirs),
    ])

    try {
        const stdout = await runGit(tempRoot, ['merge-file', '-p', oursPath, basePath, theirsPath], { allowExitCodes: [1] })
        if (stdout.includes('<<<<<<<')) {
            return null
        }
        return Buffer.from(stdout)
    } finally {
        await fs.rm(tempRoot, { recursive: true, force: true })
    }
}

function makeApplyTransactionId() {
    return `apply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function finalizeManualShadowOperation(meta: SafeOwnerMeta) {
    await writeMeta(meta)
    return buildSummary(meta)
}

export async function discardSafeOwnerFile(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
    relPath: string,
) {
    const meta = await ensureSafeOwnerWorkspace(workingDir, ownerKind, ownerId)
    const normalizedPath = normalizeRelativePath(relPath)
    const realBuffer = await readBuffer(path.join(workingDir, normalizedPath))
    await Promise.all([
        writeBuffer(path.join(meta.shadowDir, normalizedPath), realBuffer),
        writeBuffer(path.join(meta.baseDir, normalizedPath), realBuffer),
    ])
    delete meta.conflicts[normalizedPath]
    meta.lastApply = null
    return finalizeManualShadowOperation(meta)
}

export async function discardAllSafeOwnerChanges(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    const meta = await rebuildOwnerWorkspace(workingDir, ownerKind, ownerId)
    return buildSummary(meta)
}

export async function applySafeOwnerChanges(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    const meta = await ensureSafeOwnerWorkspace(workingDir, ownerKind, ownerId)
    const files = await collectPendingFiles(meta)
    const nextConflicts: SafeOwnerMeta['conflicts'] = {}
    const appliedFiles: ApplyTransactionFile[] = []

    for (const file of files) {
        const relPath = file.path
        const basePath = path.join(meta.baseDir, relPath)
        const shadowPath = path.join(meta.shadowDir, relPath)
        const realPath = path.join(workingDir, relPath)
        const [baseBuffer, shadowBuffer, realBuffer] = await Promise.all([
            readBuffer(basePath),
            readBuffer(shadowPath),
            readBuffer(realPath),
        ])

        let nextBuffer: Buffer | null = null
        let needsWrite = false
        let conflict = false

        if (buffersEqual(realBuffer, baseBuffer)) {
            nextBuffer = shadowBuffer
            needsWrite = !buffersEqual(realBuffer, nextBuffer)
        } else if (buffersEqual(realBuffer, shadowBuffer)) {
            nextBuffer = shadowBuffer
            needsWrite = false
        } else if (baseBuffer && shadowBuffer && realBuffer && !isBinaryBuffer(baseBuffer) && !isBinaryBuffer(shadowBuffer) && !isBinaryBuffer(realBuffer)) {
            const merged = await mergeTextBuffers(realBuffer, baseBuffer, shadowBuffer)
            if (merged) {
                nextBuffer = merged
                needsWrite = !buffersEqual(realBuffer, merged)
            } else {
                conflict = true
            }
        } else if (baseBuffer === null && shadowBuffer && realBuffer === null) {
            nextBuffer = shadowBuffer
            needsWrite = true
        } else if (baseBuffer && shadowBuffer === null && realBuffer === null) {
            nextBuffer = null
            needsWrite = false
        } else {
            conflict = true
        }

        if (conflict) {
            nextConflicts[relPath] = { reason: 'conflict' }
            continue
        }

        if (needsWrite) {
            await writeBuffer(realPath, nextBuffer)
            const finalRealBuffer = await readBuffer(realPath)
            appliedFiles.push({
                path: relPath,
                beforeExists: realBuffer !== null,
                beforeContentBase64: realBuffer ? realBuffer.toString('base64') : null,
                afterHash: hashBuffer(finalRealBuffer),
            })
        }

        await Promise.all([
            writeBuffer(basePath, nextBuffer),
            writeBuffer(shadowPath, nextBuffer),
        ])
    }

    meta.conflicts = nextConflicts
    meta.lastApply = appliedFiles.length > 0 ? {
        id: makeApplyTransactionId(),
        createdAt: Date.now(),
        files: appliedFiles,
    } : null

    return finalizeManualShadowOperation(meta)
}

export async function undoLastSafeOwnerApply(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
) {
    const meta = await ensureSafeOwnerWorkspace(workingDir, ownerKind, ownerId)
    if (!meta.lastApply || !(await canUndoLastApply(meta))) {
        throw new Error('The last apply can no longer be undone because the workspace changed.')
    }

    for (const file of meta.lastApply.files) {
        const beforeBuffer = file.beforeContentBase64 ? Buffer.from(file.beforeContentBase64, 'base64') : null
        const realPath = path.join(workingDir, file.path)
        const basePath = path.join(meta.baseDir, file.path)
        await Promise.all([
            writeBuffer(realPath, beforeBuffer),
            writeBuffer(basePath, beforeBuffer),
        ])
    }

    meta.lastApply = null
    return finalizeManualShadowOperation(meta)
}

export async function getSafeOwnerExecutionDir(
    workingDir: string,
    ownerKind: SafeOwnerKind,
    ownerId: string,
    mode: ExecutionMode,
) {
    if (mode !== 'safe') {
        return workingDir
    }
    const meta = await ensureSafeOwnerWorkspace(workingDir, ownerKind, ownerId)
    return meta.shadowDir
}
