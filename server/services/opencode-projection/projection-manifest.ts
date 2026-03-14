import fs from 'fs/promises'
import path from 'path'

const MANIFEST_FILENAME = 'dot-studio.manifest.json'
const NAMESPACE = 'dot-studio'

export interface ProjectionManifest {
    version: 1
    owner: typeof NAMESPACE
    stageHash: string
    files: string[]
}

function manifestPath(workingDir: string): string {
    return path.join(workingDir, '.opencode', MANIFEST_FILENAME)
}

export async function readManifest(workingDir: string): Promise<ProjectionManifest | null> {
    try {
        const raw = await fs.readFile(manifestPath(workingDir), 'utf-8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

export async function writeManifest(workingDir: string, manifest: ProjectionManifest): Promise<void> {
    const filePath = manifestPath(workingDir)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8')
}

export async function cleanStaleFiles(workingDir: string, currentFiles: string[]): Promise<void> {
    const existing = await readManifest(workingDir)
    if (!existing) {
        return
    }

    const currentSet = new Set(currentFiles)
    for (const file of existing.files) {
        if (!currentSet.has(file)) {
            const absPath = path.join(workingDir, file)
            await fs.rm(absPath, { force: true })
        }
    }
}

export async function updateGitExclude(workingDir: string): Promise<void> {
    const excludePath = path.join(workingDir, '.git', 'info', 'exclude')
    const marker = '# dot-studio projection (auto-managed)'
    const patterns = [
        marker,
        '.opencode/agents/dot-studio/',
        '.opencode/skills/dot-studio/',
        '.opencode/tools/dot_studio__*',
        '.opencode/dot-studio.manifest.json',
    ]

    let content = ''
    try {
        content = await fs.readFile(excludePath, 'utf-8')
    } catch {
        // .git/info/exclude may not exist
    }

    if (content.includes(marker)) {
        return
    }

    await fs.mkdir(path.dirname(excludePath), { recursive: true })
    const separator = content.endsWith('\n') || content === '' ? '' : '\n'
    await fs.writeFile(excludePath, content + separator + patterns.join('\n') + '\n', 'utf-8')
}

export function agentProjectionDir(workingDir: string, scope: 'stage' | 'act', stageHash: string, actId?: string): string {
    if (scope === 'act' && actId) {
        return path.join(workingDir, '.opencode', 'agents', NAMESPACE, 'act', stageHash, actId)
    }
    return path.join(workingDir, '.opencode', 'agents', NAMESPACE, 'stage', stageHash)
}

export function skillProjectionDir(workingDir: string, scope: 'global' | 'local', stageHash: string): string {
    return path.join(workingDir, '.opencode', 'skills', NAMESPACE, scope, stageHash)
}

export function toRelativePath(workingDir: string, absPath: string): string {
    return path.relative(workingDir, absPath)
}
