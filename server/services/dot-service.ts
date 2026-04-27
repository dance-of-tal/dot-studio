import fs from 'fs/promises'
import {
    ensureDotDir,
    getDotDir,
    getGlobalCwd,
    getGlobalDotDir,
    initRegistry,
    installActWithDependencies,
    installAsset,
    installPerformerWithDeps,
    parsePerformerAsset,
    readAsset,
    reportInstall,
    searchRegistry,
    startLogin,
} from '../lib/dot-source.js'
import type { PerformerAsset } from '../lib/dot-source.js'
import type { AssetListItem } from '../../shared/asset-contracts.js'
import { clearDotAuthUser, publishStudioAsset, readDotAuthUser, saveLocalStudioAsset, uninstallStudioAsset, type StudioAssetKind } from '../lib/dot-authoring.js'
import { invalidate } from '../lib/cache.js'
import { findInstalledDependents, getRegistryAssetDetail } from './asset-service.js'

type RegistrySearchResult = {
    urn: string
    kind: 'tal' | 'dance' | 'performer' | 'act'
    name: string
    owner: string
    stage: string
    description: string
    tags: string[]
    updatedAt?: string
}

function toRegistrySearchAsset(result: RegistrySearchResult): AssetListItem {
    return {
        kind: result.kind,
        urn: result.urn,
        slug: result.name,
        name: result.name,
        author: `@${result.owner.replace(/^@/, '')}`,
        source: 'registry',
        description: result.description || '',
        tags: Array.isArray(result.tags) ? result.tags : [],
        ...(result.updatedAt ? { updatedAt: result.updatedAt } : {}),
    } as AssetListItem
}

export function resolveDotCwd(cwd: string, scope?: string) {
    if (scope === 'global') {
        return getGlobalCwd()
    }
    return cwd
}

export async function getDotStatus(cwd: string) {
    const dotDir = getDotDir(cwd)
    const globalDotDir = getGlobalDotDir()
    const [stageExists, globalExists] = await Promise.all([
        fs.access(dotDir).then(() => true).catch(() => false),
        fs.access(globalDotDir).then(() => true).catch(() => false),
    ])

    return {
        initialized: stageExists || globalExists,
        stageInitialized: stageExists,
        globalInitialized: globalExists,
        dotDir,
        globalDotDir,
        projectDir: cwd,
    }
}

export async function getDotStatusSnapshot(cwd: string) {
    try {
        return await getDotStatus(cwd)
    } catch {
        return {
            initialized: false,
            stageInitialized: false,
            globalInitialized: false,
            dotDir: '',
            globalDotDir: '',
            projectDir: cwd,
        }
    }
}

export async function getDotPerformer(cwd: string, urn: string): Promise<PerformerAsset | null> {
    const raw = await readAsset(cwd, urn)
    if (!raw) return null
    try {
        return parsePerformerAsset(raw)
    } catch {
        return null
    }
}

export async function searchDotRegistry(query: string, options: { kind?: string | null; limit: number }) {
    const results = await searchRegistry(query, {
        kind: options.kind || undefined,
        limit: options.limit,
    })

    return Promise.all(results.map(async (result) => {
        const typedResult = result as RegistrySearchResult
        const fallback = toRegistrySearchAsset(typedResult)

        if (typedResult.kind !== 'performer' && typedResult.kind !== 'act') {
            return fallback
        }

        try {
            return await getRegistryAssetDetail(
                '',
                typedResult.kind,
                typedResult.owner,
                `${typedResult.stage}/${typedResult.name}`,
            )
        } catch {
            return fallback
        }
    }))
}

const SKILLS_SH_API = 'https://skills.sh/api/search'

export async function searchSkillsCatalog(query: string, limit = 10) {
    if (!query.trim()) return []
    const url = `${SKILLS_SH_API}?q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as {
        skills: Array<{ id: string; name: string; installs: number; source: string }>
    }
    return (data.skills || []).map((skill) => ({
        urn: `dance/@${skill.source || 'skills.sh'}/${skill.name}`,
        kind: 'dance',
        name: skill.name,
        owner: skill.source || 'skills.sh',
        stage: skill.source?.split('/')[1] || '',
        description: `${formatInstalls(skill.installs)} · from ${skill.source || 'skills.sh'}`,
        tags: ['skills.sh'] as string[],
        installs: skill.installs,
    }))
}

function formatInstalls(count: number): string {
    if (!count || count <= 0) return '0 installs'
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`
    return `${count} install${count === 1 ? '' : 's'}`
}

/** Validates canonical performer assets after parsing. */
export function validateDotPerformer(performer: PerformerAsset): void {
    // Canonical assets are already validated by parsePerformerAsset,
    // but we can add extra runtime checks if needed.
    if (!performer.payload.tal && (!performer.payload.dances || performer.payload.dances.length === 0)) {
        throw new Error("Invalid performer: at least one of 'tal' or 'dances' must be present.")
    }
}

export async function initDotRegistry(cwd: string, scope?: string) {
    const targetCwd = resolveDotCwd(cwd, scope)
    await initRegistry(targetCwd)
    return {
        ok: true,
        dotDir: getDotDir(targetCwd),
        scope: scope || 'stage',
    }
}

export async function installDotAsset(cwd: string, input: {
    urn: string
    force?: boolean
    scope?: 'global' | 'stage'
}) {
    const targetCwd = resolveDotCwd(cwd, input.scope)
    await ensureDotDir(targetCwd)

    if (input.urn.startsWith('performer/')) {
        const result = await installPerformerWithDeps(targetCwd, input.urn, input.force)
        // Report installs for non-skipped assets (best-effort)
        for (const asset of result.installedAssets) {
            if (!asset.skipped) reportInstall(asset.urn).catch(() => {})
        }
        invalidate('assets')
        return { ...result, scope: input.scope || 'stage' }
    }

    if (input.urn.startsWith('act/')) {
        const result = await installActWithDependencies(targetCwd, input.urn, input.force)
        for (const asset of result.installedAssets) {
            if (!asset.skipped) reportInstall(asset.urn).catch(() => {})
        }
        invalidate('assets')
        return { ...result, scope: input.scope || 'stage' }
    }

    const result = await installAsset(targetCwd, input.urn, input.force)
    if (!result.skipped) reportInstall(input.urn).catch(() => {})
    invalidate('assets')
    return { ...result, scope: input.scope || 'stage' }
}

export async function getDotAuthUser() {
    const auth = await readDotAuthUser()
    return {
        authenticated: !!auth,
        username: auth?.username || null,
    }
}

export async function loginToDot() {
    const result = await startLogin()
    return { ok: true, ...result }
}

export async function logoutFromDot() {
    await clearDotAuthUser()
    return { ok: true }
}

export async function saveDotLocalAsset(cwd: string, input: {
    kind: StudioAssetKind
    slug: string
    stage?: string
    author?: string
    payload: unknown
}) {
    const auth = await readDotAuthUser()
    const author = input.author || auth?.username
    if (!author) {
        throw new Error('No author available. Sign in with `dot login` first.')
    }

    const saved = await saveLocalStudioAsset({
        cwd,
        kind: input.kind,
        author,
        slug: input.slug,
        stage: input.stage,
        payload: input.payload,
    })
    invalidate('assets')
    return { ok: true, ...saved }
}

export async function publishDotAsset(cwd: string, input: {
    kind: StudioAssetKind
    slug: string
    stage?: string
    payload?: unknown
    tags?: string[]
    providedAssets?: Array<{
        kind: 'tal' | 'performer' | 'act'
        urn: string
        payload: Record<string, unknown>
        tags?: string[]
    }>
}) {
    const auth = await readDotAuthUser()
    if (!auth) {
        const error = Object.assign(new Error('You are not logged in. Run `dot login` first.'), { status: 401 })
        throw error
    }

    const result = await publishStudioAsset({
        cwd,
        kind: input.kind,
        slug: input.slug,
        stage: input.stage,
        payload: input.payload,
        tags: input.tags,
        providedAssets: input.providedAssets,
        auth,
    })
    invalidate('assets')
    return { ok: true, ...result }
}

export async function uninstallDotAsset(cwd: string, input: {
    kind: StudioAssetKind
    urn: string
    cascade?: boolean
}) {
    const deletedUrns: string[] = []

    if (input.cascade) {
        const plan = await findInstalledDependents(cwd, input.urn)
        // Delete dependents first (bottom-up: acts before performers)
        const sortedDependents = [...plan.dependents].sort((a, b) => {
            const order: Record<string, number> = { act: 0, performer: 1, dance: 2, tal: 3 }
            return (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
        })
        for (const dep of sortedDependents) {
            try {
                await uninstallStudioAsset(cwd, dep.urn)
                deletedUrns.push(dep.urn)
            } catch { /* skip already-deleted */ }
        }
    }

    const result = await uninstallStudioAsset(cwd, input.urn)
    deletedUrns.push(input.urn)
    invalidate('assets')
    return { ok: true, ...result, deletedUrns }
}

export async function previewUninstallDotAsset(cwd: string, input: {
    kind: StudioAssetKind
    urn: string
}) {
    return findInstalledDependents(cwd, input.urn)
}
