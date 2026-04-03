import fs from 'fs/promises'
import path from 'path'

const MANIFEST_FILENAME = 'dot-studio.manifest.json'
const NAMESPACE = 'dot-studio'

export interface ProjectionManifest {
    version: 1
    owner: typeof NAMESPACE
    workspaceHash: string
    groups: Record<string, string[]>
    runtime?: {
        projectionPending?: boolean
        updatedAt?: number
    }
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

async function readOrCreateManifest(executionDir: string, workspaceHash = ''): Promise<ProjectionManifest> {
    return (await readManifest(executionDir)) || {
        version: 1 as const,
        owner: NAMESPACE,
        workspaceHash,
        groups: {},
    }
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
    workspaceHash: string,
    groupKey: string,
    files: string[],
) {
    const current = await readOrCreateManifest(executionDir, workspaceHash)

    current.workspaceHash = workspaceHash
    current.groups[groupKey] = files
    await writeManifest(executionDir, current)
}

export async function hasPendingProjectionRuntimeAdoption(executionDir: string): Promise<boolean> {
    const manifest = await readManifest(executionDir)
    return manifest?.runtime?.projectionPending === true
}

export async function markProjectionRuntimePending(
    executionDir: string,
    workspaceHash = '',
): Promise<void> {
    const manifest = await readOrCreateManifest(executionDir, workspaceHash)
    manifest.runtime = {
        ...(manifest.runtime || {}),
        projectionPending: true,
        updatedAt: Date.now(),
    }
    await writeManifest(executionDir, manifest)
}

export async function clearProjectionRuntimePending(executionDir: string): Promise<void> {
    const manifest = await readManifest(executionDir)
    if (!manifest?.runtime?.projectionPending) {
        return
    }
    manifest.runtime = {
        ...(manifest.runtime || {}),
        projectionPending: false,
        updatedAt: Date.now(),
    }
    await writeManifest(executionDir, manifest)
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
    workspaceHash: string,
    scope: 'workspace' | 'act' = 'workspace',
    actId?: string,
) {
    if (scope === 'act' && actId) {
        return path.join(executionDir, '.opencode', 'agents', NAMESPACE, 'act', workspaceHash, actId)
    }
    return path.join(executionDir, '.opencode', 'agents', NAMESPACE, 'workspace', workspaceHash)
}

export function localSkillProjectionDir(
    executionDir: string,
    workspaceHash: string,
    performerId: string,
    scope: 'workspace' | 'act' = 'workspace',
    actId?: string,
) {
    if (scope === 'act' && actId) {
        return path.join(executionDir, '.opencode', 'skills', NAMESPACE, 'act', workspaceHash, actId, performerId)
    }
    return path.join(executionDir, '.opencode', 'skills', NAMESPACE, 'workspace', workspaceHash, performerId)
}

export function toRelativePath(executionDir: string, absPath: string) {
    return path.relative(executionDir, absPath)
}

export type Posture = 'build' | 'plan'

/**
 * Single source of truth for agent identity.
 * agentName is mechanically derived from filePath — never manually assembled.
 */
export function resolveAgentIdentity(input: {
    executionDir: string
    workspaceHash: string
    performerId: string
    posture: Posture
    scope: 'workspace' | 'act'
    actId?: string
}) {
    const dir = agentProjectionDir(input.executionDir, input.workspaceHash, input.scope, input.actId)
    const fileName = `${input.performerId}--${input.posture}.md`
    const filePath = path.join(dir, fileName)
    const agentName = path.relative(
        path.join(input.executionDir, '.opencode', 'agents'),
        filePath,
    ).replace(/\.md$/, '')

    return { agentName, filePath, fileName }
}
