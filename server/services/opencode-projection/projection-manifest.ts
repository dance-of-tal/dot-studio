import fs from 'fs/promises'
import path from 'path'

const MANIFEST_FILENAME = 'dot-studio.manifest.json'
const NAMESPACE = 'dot-studio'

export interface ProjectionManifest {
    version: 1
    owner: typeof NAMESPACE
    stageHash: string
    groups: Record<string, string[]>
}

function manifestPath(executionDir: string) {
    return path.join(executionDir, '.opencode', MANIFEST_FILENAME)
}

export async function readManifest(executionDir: string): Promise<ProjectionManifest | null> {
    try {
        const raw = await fs.readFile(manifestPath(executionDir), 'utf-8')
        return JSON.parse(raw) as ProjectionManifest
    } catch {
        return null
    }
}

export async function writeManifest(executionDir: string, manifest: ProjectionManifest) {
    const filePath = manifestPath(executionDir)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8')
}

export async function cleanGroupFiles(
    executionDir: string,
    groupKey: string,
    currentFiles: string[],
) {
    const existing = await readManifest(executionDir)
    if (!existing) {
        return
    }

    const currentSet = new Set(currentFiles)
    for (const file of existing.groups[groupKey] || []) {
        if (!currentSet.has(file)) {
            await fs.rm(path.join(executionDir, file), { force: true, recursive: true }).catch(() => {})
        }
    }
}

export async function updateManifestGroup(
    executionDir: string,
    stageHash: string,
    groupKey: string,
    files: string[],
) {
    const current = (await readManifest(executionDir)) || {
        version: 1 as const,
        owner: NAMESPACE,
        stageHash,
        groups: {},
    }

    current.stageHash = stageHash
    current.groups[groupKey] = files
    await writeManifest(executionDir, current)
}

export async function updateGitExclude(executionDir: string) {
    const gitDir = path.join(executionDir, '.git')
    const gitStat = await fs.stat(gitDir).catch(() => null)
    if (!gitStat?.isDirectory()) {
        return
    }

    const excludePath = path.join(gitDir, 'info', 'exclude')
    const marker = '# dot-studio projection (auto-managed)'
    const patterns = [
        marker,
        '.opencode/agents/dot-studio/',
        '.opencode/skills/dot-studio/',
        '.opencode/dot-studio.manifest.json',
    ]

    let content = ''
    try {
        content = await fs.readFile(excludePath, 'utf-8')
    } catch {
        // ignore missing exclude file
    }

    if (content.includes(marker)) {
        return
    }

    await fs.mkdir(path.dirname(excludePath), { recursive: true })
    const separator = content === '' || content.endsWith('\n') ? '' : '\n'
    await fs.writeFile(excludePath, content + separator + patterns.join('\n') + '\n', 'utf-8')
}

export function agentProjectionDir(
    executionDir: string,
    stageHash: string,
    scope: 'stage' | 'act' = 'stage',
    actId?: string,
) {
    if (scope === 'act' && actId) {
        return path.join(executionDir, '.opencode', 'agents', NAMESPACE, 'act', stageHash, actId)
    }
    return path.join(executionDir, '.opencode', 'agents', NAMESPACE, 'stage', stageHash)
}

export function localSkillProjectionDir(
    executionDir: string,
    stageHash: string,
    performerId: string,
    scope: 'stage' | 'act' = 'stage',
    actId?: string,
) {
    if (scope === 'act' && actId) {
        return path.join(executionDir, '.opencode', 'skills', NAMESPACE, 'act', stageHash, actId, performerId)
    }
    return path.join(executionDir, '.opencode', 'skills', NAMESPACE, 'stage', stageHash, performerId)
}

export function toRelativePath(executionDir: string, absPath: string) {
    return path.relative(executionDir, absPath)
}
