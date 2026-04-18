import fs from 'fs/promises'
import path from 'path'
import type { GitHubDanceSourceInfo } from '../../shared/asset-contracts.js'
import {
    copySkillDir,
    danceAssetDir,
    discoverSkills,
    getOwnerRepo,
    readPluginManifest,
    shallowClone,
    upsertSkillLockEntry,
    type DiscoveredSkill,
    type ParsedSource,
} from '../lib/dot-source.js'

type RawSkillLock = {
    skills?: Record<string, unknown>
}

async function readSkillLock(cwd: string) {
    const addModule = await import('dance-of-tal/lib/add') as unknown as {
        readSkillLock?: (targetCwd: string) => Promise<unknown>
    }

    if (typeof addModule.readSkillLock === 'function') {
        return addModule.readSkillLock(cwd)
    }

    return { version: 1, skills: {} }
}

type RawGitHubSkillLockEntry = {
    source?: unknown
    sourceUrl?: unknown
    skillPath?: unknown
    repoRootSkillPath?: unknown
    owner?: unknown
    repo?: unknown
    ref?: unknown
    sourceSubpath?: unknown
    skillFolderHash?: unknown
    installedAt?: unknown
    updatedAt?: unknown
}

export type NormalizedGitHubDanceLockEntry = GitHubDanceSourceInfo & {
    owner: string
    repo: string
    sourceUrl: string
    ref: string
    repoRootSkillPath: string
}

export type DiscoveredGitHubDanceSkill = {
    skill: DiscoveredSkill
    repoRootSkillPath: string
}

type GitHubTreeShaResult =
    | { status: 'ok'; hash: string }
    | { status: 'missing' }
    | { status: 'error'; message: string }

function normalizeRepoPath(value: string | null | undefined) {
    if (!value) return ''
    return value
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .join('/')
}

function parseOwnerRepo(sourceUrl: string, fallbackOwner?: string, fallbackRepo?: string) {
    const parsed = getOwnerRepo(sourceUrl)
    if (parsed) {
        const [owner, repo] = parsed.split('/')
        if (owner && repo) {
            return { owner, repo }
        }
    }
    if (fallbackOwner && fallbackRepo) {
        return { owner: fallbackOwner, repo: fallbackRepo }
    }
    return null
}

function readRawSkillEntries(lock: unknown) {
    const raw = lock as RawSkillLock | null | undefined
    return raw?.skills && typeof raw.skills === 'object'
        ? Object.entries(raw.skills)
        : []
}

export function normalizeGitHubDanceLockEntry(rawEntry: unknown): GitHubDanceSourceInfo | null {
    const entry = rawEntry as RawGitHubSkillLockEntry | null | undefined
    if (!entry || entry.source !== 'github' || typeof entry.sourceUrl !== 'string' || !entry.sourceUrl.trim()) {
        return null
    }

    const ownerRepo = parseOwnerRepo(
        entry.sourceUrl,
        typeof entry.owner === 'string' ? entry.owner : undefined,
        typeof entry.repo === 'string' ? entry.repo : undefined,
    )
    const repoRootSkillPath = normalizeRepoPath(
        typeof entry.repoRootSkillPath === 'string'
            ? entry.repoRootSkillPath
            : typeof entry.skillPath === 'string'
                ? entry.skillPath
                : '',
    )
    const ref = typeof entry.ref === 'string' && entry.ref.trim()
        ? entry.ref.trim()
        : 'HEAD'
    const sourceSubpath = normalizeRepoPath(typeof entry.sourceSubpath === 'string' ? entry.sourceSubpath : '')
    const verifiable = !!ownerRepo?.owner && !!ownerRepo?.repo && !!repoRootSkillPath

    return {
        source: 'github',
        sourceUrl: entry.sourceUrl.replace(/\.git$/, ''),
        ...(ownerRepo?.owner ? { owner: ownerRepo.owner } : {}),
        ...(ownerRepo?.repo ? { repo: ownerRepo.repo } : {}),
        ...(ref ? { ref } : {}),
        ...(sourceSubpath ? { sourceSubpath } : {}),
        ...(repoRootSkillPath ? { repoRootSkillPath } : {}),
        ...(typeof entry.skillFolderHash === 'string' && entry.skillFolderHash ? { skillFolderHash: entry.skillFolderHash } : {}),
        ...(typeof entry.installedAt === 'string' ? { installedAt: entry.installedAt } : {}),
        ...(typeof entry.updatedAt === 'string' ? { updatedAt: entry.updatedAt } : {}),
        legacy: !(
            typeof entry.owner === 'string'
            && typeof entry.repo === 'string'
            && typeof entry.ref === 'string'
            && typeof entry.repoRootSkillPath === 'string'
        ),
        verifiable,
    }
}

export async function readGitHubDanceSourceMap(cwd: string) {
    const lock = await readSkillLock(cwd)
    const map = new Map<string, GitHubDanceSourceInfo>()
    for (const [urn, rawEntry] of readRawSkillEntries(lock)) {
        const normalized = normalizeGitHubDanceLockEntry(rawEntry)
        if (normalized) {
            map.set(urn, normalized)
        }
    }
    return map
}

export async function readNormalizedGitHubDanceLockEntries(cwd: string) {
    const lock = await readSkillLock(cwd)
    const entries: Array<{ urn: string; entry: NormalizedGitHubDanceLockEntry }> = []

    for (const [urn, rawEntry] of readRawSkillEntries(lock)) {
        const normalized = normalizeGitHubDanceLockEntry(rawEntry)
        if (normalized?.verifiable && normalized.owner && normalized.repo && normalized.ref && normalized.repoRootSkillPath) {
            entries.push({ urn, entry: normalized as NormalizedGitHubDanceLockEntry })
        }
    }

    return entries
}

async function fetchGitHubJson(url: string) {
    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
            },
        })

        if (response.status === 404) {
            return { status: 404 as const, body: null }
        }
        if (!response.ok) {
            return { status: response.status, body: null }
        }

        return {
            status: response.status,
            body: await response.json() as unknown,
        }
    } catch (error: unknown) {
        return {
            status: 0,
            body: error instanceof Error ? error : null,
        }
    }
}

export async function resolveGitHubRef(owner: string, repo: string, requestedRef?: string) {
    if (requestedRef?.trim()) {
        return requestedRef.trim()
    }

    const response = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}`)
    if (response.status === 200 && response.body && typeof response.body === 'object') {
        const defaultBranch = (response.body as { default_branch?: unknown }).default_branch
        if (typeof defaultBranch === 'string' && defaultBranch.trim()) {
            return defaultBranch.trim()
        }
    }

    return 'HEAD'
}

export async function getGitHubTreeSha(
    owner: string,
    repo: string,
    ref: string,
    repoRootSkillPath: string,
): Promise<GitHubTreeShaResult> {
    const normalizedPath = normalizeRepoPath(repoRootSkillPath)
    if (!normalizedPath) {
        return { status: 'error', message: 'Missing repo skill path.' }
    }

    const response = await fetchGitHubJson(
        `https://api.github.com/repos/${owner}/${repo}/contents/${normalizedPath}?ref=${encodeURIComponent(ref)}`,
    )

    if (response.status === 404) {
        return { status: 'missing' }
    }
    if (response.status !== 200) {
        return {
            status: 'error',
            message: response.status === 0
                ? 'Could not reach GitHub.'
                : `GitHub returned ${response.status}.`,
        }
    }

    const payload = response.body
    if (Array.isArray(payload)) {
        const childShas = payload
            .map((item) => (
                item && typeof item === 'object' && typeof (item as { sha?: unknown }).sha === 'string'
                    ? (item as { sha: string }).sha
                    : null
            ))
            .filter((value): value is string => !!value)
            .sort()
            .join(',')

        if (!childShas) {
            return { status: 'error', message: 'GitHub response was missing child SHAs.' }
        }

        const { createHash } = await import('crypto')
        return {
            status: 'ok',
            hash: createHash('sha256').update(childShas).digest('hex').slice(0, 40),
        }
    }

    if (payload && typeof payload === 'object' && typeof (payload as { sha?: unknown }).sha === 'string') {
        return {
            status: 'ok',
            hash: (payload as { sha: string }).sha,
        }
    }

    return { status: 'error', message: 'GitHub response did not include a tree hash.' }
}

export async function discoverGitHubDanceSkills(
    tempDir: string,
    parsedSource: Pick<ParsedSource, 'subpath'>,
) {
    const searchDir = parsedSource.subpath ? path.join(tempDir, parsedSource.subpath) : tempDir
    const discovered: DiscoveredGitHubDanceSkill[] = []
    const seenPaths = new Set<string>()

    const register = async (rootDir: string) => {
        const skills = await discoverSkills(rootDir)
        for (const skill of skills) {
            const repoRootSkillPath = normalizeRepoPath(path.relative(tempDir, path.dirname(skill.skillMdPath)))
            if (!repoRootSkillPath || seenPaths.has(repoRootSkillPath)) continue
            seenPaths.add(repoRootSkillPath)
            discovered.push({ skill, repoRootSkillPath })
        }
    }

    await register(searchDir)

    const manifest = await readPluginManifest(tempDir)
    if (manifest?.skills.length) {
        for (const entry of manifest.skills) {
            const skillDir = path.join(tempDir, entry.path)
            await register(skillDir)
        }
    }

    return discovered
}

export function buildGitHubDanceLockEntryInput(
    parsedSource: ParsedSource,
    resolvedRef: string,
    repoRootSkillPath: string,
    skillFolderHash?: string,
) {
    const sourceSubpath = normalizeRepoPath(parsedSource.subpath)
    return {
        source: 'github' as const,
        sourceUrl: parsedSource.url.replace(/\.git$/, ''),
        skillPath: repoRootSkillPath,
        owner: parsedSource.owner,
        repo: parsedSource.repo,
        ref: resolvedRef,
        ...(sourceSubpath ? { sourceSubpath } : {}),
        repoRootSkillPath,
        ...(skillFolderHash ? { skillFolderHash } : {}),
    }
}

export async function upsertGitHubDanceLockEntry(
    cwd: string,
    urn: string,
    entry: ReturnType<typeof buildGitHubDanceLockEntryInput>,
) {
    await upsertSkillLockEntry(
        cwd,
        urn,
        entry as unknown as {
            source: 'github'
            sourceUrl: string
            skillPath: string
            skillFolderHash?: string
        },
    )
}

export async function cloneGitHubDanceSource(sourceUrl: string, ref: string) {
    return shallowClone({
        url: `${sourceUrl.replace(/\/+$/, '').replace(/\.git$/, '')}.git`,
        ref: ref !== 'HEAD' ? ref : undefined,
    })
}

export async function copyGitHubDanceSkill(
    cwd: string,
    urn: string,
    sourceSkillDir: string,
) {
    const destinationDir = danceAssetDir(cwd, urn)
    copySkillDir(sourceSkillDir, destinationDir)
    return destinationDir
}

export async function localDanceBundleExists(cwd: string, urn: string) {
    try {
        await fs.access(danceAssetDir(cwd, urn))
        return true
    } catch {
        return false
    }
}
