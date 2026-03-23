import fs from 'fs/promises'
import path from 'path'

import type { AssetListItem } from '../../shared/asset-contracts.js'
import type {
    ActAsset,
    DanceAsset,
    PerformerAsset,
    TalAsset,
} from '../../shared/dot-types.js'
import {
    assetFilePath,
    getDotDir,
    getGlobalCwd,
    getGlobalDotDir,
    getRegistryPackage,
    parseDotAsset,
    readAsset,
} from '../lib/dot-source.js'
import { readProjectMcpCatalog } from '../lib/project-config.js'
import { resolvePerformerMcpPortability } from '../../shared/performer-mcp-portability.js'

type ParsedInstalledAsset = TalAsset | DanceAsset | PerformerAsset | ActAsset

type InstalledAssetEntry = {
    asset: ParsedInstalledAsset
    source: 'global' | 'stage'
}

export type UninstallPlanItem = {
    urn: string
    kind: string
    name: string
    source: 'global' | 'stage'
    reason: string
}

export type UninstallPlan = {
    target: UninstallPlanItem
    dependents: UninstallPlanItem[]
}

/**
 * Returns the display name/slug of an asset.
 * For 4-segment URNs: kind/@owner/stage/name  → name (segment 3)
 * For 3-segment URNs: kind/@owner/name         → name (segment 2, legacy fallback)
 */
function assetSlug(asset: ParsedInstalledAsset) {
    const parts = asset.urn.split('/')
    return (parts.length === 4 ? parts[3] : parts[2]) || asset.urn
}

function assetAuthor(asset: ParsedInstalledAsset) {
    return asset.urn.split('/')[1] || '@unknown'
}

function assetStage(asset: ParsedInstalledAsset) {
    const parts = asset.urn.split('/')
    return parts.length === 4 ? parts[2] : undefined
}

function assetSchema(asset: ParsedInstalledAsset) {
    return (asset as ParsedInstalledAsset & { $schema?: string }).$schema
}

function normalizeAsset(
    asset: ParsedInstalledAsset,
    source: 'global' | 'stage' | 'registry',
    projectMcpServerNames: string[],
    detail = false,
): AssetListItem {
    switch (asset.kind) {
        case 'tal':
            return {
                kind: asset.kind,
                urn: asset.urn,
                slug: assetSlug(asset),
                name: assetSlug(asset),
                author: assetAuthor(asset),
                source,
                description: asset.description || '',
                tags: asset.tags || [],
                schema: assetSchema(asset),
                ...(detail ? { content: asset.payload.content } : {}),
            }
        case 'dance':
            return {
                kind: asset.kind,
                urn: asset.urn,
                slug: assetSlug(asset),
                name: assetSlug(asset),
                author: assetAuthor(asset),
                source,
                description: asset.description || '',
                tags: asset.tags || [],
                schema: assetSchema(asset),
                ...(detail ? { content: asset.payload.content } : {}),
            }
        case 'performer': {
            const portability = resolvePerformerMcpPortability(
                asset.payload.mcp_config,
                projectMcpServerNames,
            )
            return {
                kind: asset.kind,
                urn: asset.urn,
                slug: assetSlug(asset),
                name: assetSlug(asset),
                author: assetAuthor(asset),
                source,
                description: asset.description || '',
                tags: asset.tags || [],
                schema: assetSchema(asset),
                talUrn: asset.payload.tal || null,
                danceUrns: asset.payload.dances || [],
                model: asset.payload.model || null,
                modelVariant: asset.payload.modelVariant || null,
                mcpConfig: asset.payload.mcp_config || null,
                declaredMcpServerNames: portability.declaredMcpServerNames,
                projectMcpMatches: portability.projectMcpMatches,
                projectMcpMissing: portability.projectMcpMissing,
            }
        }
        case 'act':
            return {
                kind: asset.kind,
                urn: asset.urn,
                slug: assetSlug(asset),
                name: assetSlug(asset),
                author: assetAuthor(asset),
                source,
                description: asset.description || '',
                tags: asset.tags || [],
                schema: assetSchema(asset),
                actRules: asset.payload.actRules || [],
                participantCount: asset.payload.participants.length,
                relationCount: asset.payload.relations.length,
                participants: asset.payload.participants,
                relations: asset.payload.relations,
            }
    }
}

function extractRegistryDetailMeta(pkg: Record<string, unknown>) {
    return {
        stars: typeof pkg.stars === 'number' ? pkg.stars : 0,
        tier: typeof pkg.tier === 'string' ? pkg.tier : undefined,
        updatedAt: typeof pkg.updatedAt === 'string' ? pkg.updatedAt : undefined,
    }
}

function extractReferencedUrns(asset: ParsedInstalledAsset): string[] {
    if (asset.kind === 'performer') {
        return Array.from(new Set([
            ...(asset.payload.tal ? [asset.payload.tal] : []),
            ...(asset.payload.dances || []),
        ]))
    }

    if (asset.kind === 'act') {
        return Array.from(new Set(asset.payload.participants.map((participant) => participant.performer)))
    }

    return []
}

async function parseInstalledAssetFile(filePath: string): Promise<ParsedInstalledAsset | null> {
    try {
        const raw = JSON.parse(await fs.readFile(filePath, 'utf-8'))
        return parseDotAsset(raw) as ParsedInstalledAsset
    } catch {
        return null
    }
}

async function scanAssetDir(
    baseDir: string,
    kind: ParsedInstalledAsset['kind'],
    source: 'global' | 'stage',
    resultsMap: Map<string, AssetListItem>,
    projectMcpServerNames: string[],
) {
    const kindDir = path.join(baseDir, 'assets', kind)
    try {
        const authors = await fs.readdir(kindDir)
        for (const author of authors) {
            if (!author.startsWith('@')) continue
            const authorDir = path.join(kindDir, author)
            const stat = await fs.stat(authorDir)
            if (!stat.isDirectory()) continue

            if (kind === 'dance') {
                // Dance: @owner/stage/name/SKILL.md  (3 levels deep)
                const stages = await fs.readdir(authorDir)
                for (const stage of stages) {
                    const stageDir = path.join(authorDir, stage)
                    const stageStat = await fs.stat(stageDir).catch(() => null)
                    if (!stageStat?.isDirectory()) continue
                    const names = await fs.readdir(stageDir)
                    for (const name of names) {
                        const skillMd = path.join(stageDir, name, 'SKILL.md')
                        const exists = await fs.access(skillMd).then(() => true).catch(() => false)
                        if (!exists) continue
                        const urn = `dance/${author}/${stage}/${name}`
                        const parsed = await readAsset(baseDir, urn)
                        if (!parsed) continue
                        try {
                            const asset = parseDotAsset(parsed) as ParsedInstalledAsset
                            resultsMap.set(asset.urn, normalizeAsset(asset, source, projectMcpServerNames, false))
                        } catch {
                            // invalid asset, skip
                        }
                    }
                }
            } else {
                // Tal / Performer / Act: @owner/name.json
                const files = await fs.readdir(authorDir)
                for (const file of files) {
                    if (!file.endsWith('.json')) continue
                    const parsed = await parseInstalledAssetFile(path.join(authorDir, file))
                    if (!parsed || parsed.kind !== kind) continue
                    resultsMap.set(parsed.urn, normalizeAsset(parsed, source, projectMcpServerNames, false))
                }
            }
        }
    } catch {
        // directory doesn't exist
    }
}

async function collectAllInstalledAssets(cwd: string): Promise<InstalledAssetEntry[]> {
    const entries: InstalledAssetEntry[] = []
    const scopes = [
        { dir: getGlobalDotDir(), source: 'global' as const },
        { dir: getDotDir(cwd), source: 'stage' as const },
    ]

    for (const scope of scopes) {
        for (const kind of ['tal', 'dance', 'performer', 'act'] as const) {
            const kindDir = path.join(scope.dir, 'assets', kind)
            try {
                const authors = await fs.readdir(kindDir)
                for (const author of authors) {
                    if (!author.startsWith('@')) continue
                    const authorDir = path.join(kindDir, author)
                    const stat = await fs.stat(authorDir)
                    if (!stat.isDirectory()) continue

                    if (kind === 'dance') {
                        // Dance: @owner/stage/name/SKILL.md (3 levels deep)
                        const stages = await fs.readdir(authorDir)
                        for (const stage of stages) {
                            const stageDir = path.join(authorDir, stage)
                            const stageStat = await fs.stat(stageDir).catch(() => null)
                            if (!stageStat?.isDirectory()) continue
                            const names = await fs.readdir(stageDir)
                            for (const name of names) {
                                const skillMd = path.join(stageDir, name, 'SKILL.md')
                                const exists = await fs.access(skillMd).then(() => true).catch(() => false)
                                if (!exists) continue
                                const urn = `dance/${author}/${stage}/${name}`
                                const parsed = await readAsset(scope.dir, urn)
                                if (!parsed) continue
                                try {
                                    const asset = parseDotAsset(parsed) as ParsedInstalledAsset
                                    entries.push({ asset, source: scope.source })
                                } catch {
                                    // invalid asset, skip
                                }
                            }
                        }
                    } else {
                        // Tal / Performer / Act: @owner/name.json
                        const files = await fs.readdir(authorDir)
                        for (const file of files) {
                            if (!file.endsWith('.json')) continue
                            const parsed = await parseInstalledAssetFile(path.join(authorDir, file))
                            if (!parsed || parsed.kind !== kind) continue
                            entries.push({ asset: parsed, source: scope.source })
                        }
                    }
                }
            } catch {
                // directory doesn't exist
            }
        }
    }

    return entries
}

export async function listStudioAssets(
    cwd: string,
    kind: ParsedInstalledAsset['kind'],
): Promise<AssetListItem[]> {
    const resultsMap = new Map<string, AssetListItem>()
    const projectMcpServerNames = Object.keys(await readProjectMcpCatalog(cwd))
    await scanAssetDir(getGlobalDotDir(), kind, 'global', resultsMap, projectMcpServerNames)
    await scanAssetDir(getDotDir(cwd), kind, 'stage', resultsMap, projectMcpServerNames)
    return Array.from(resultsMap.values())
}

export async function resolveStudioAssetSource(cwd: string, urn: string): Promise<'global' | 'stage'> {
    const [kind] = urn.split('/')
    if (kind === 'dance') {
        // Dance is a directory bundle — check for the dir, not a file
        const { danceAssetDir: danceDir } = await import('../lib/dot-source.js')
        try {
            await fs.access(danceDir(cwd, urn))
            return 'stage'
        } catch {
            try {
                await fs.access(danceDir(getGlobalCwd(), urn))
                return 'global'
            } catch {
                return 'stage'
            }
        }
    }
    try {
        await fs.access(assetFilePath(cwd, urn))
        return 'stage'
    } catch {
        try {
            await fs.access(assetFilePath(getGlobalCwd(), urn))
            return 'global'
        } catch {
            return 'stage'
        }
    }
}

export async function getStudioAsset(cwd: string, kind: string, author: string, assetPath: string) {
    // Try 4-segment URN first (kind/@author/stage/name), then legacy 3-segment
    const tryUrns = [
        `${kind}/@${author}/${assetPath}`,
    ]
    // If path doesn't contain '/', also try with stage prefix derived from cwd
    if (!assetPath.includes('/')) {
        const { default: pathLib } = await import('path')
        const stage = pathLib.basename(cwd).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default'
        tryUrns.unshift(`${kind}/@${author}/${stage}/${assetPath}`)
    }

    let raw: Record<string, unknown> | null = null
    let resolvedUrn = ''
    for (const urn of tryUrns) {
        raw = await readAsset(cwd, urn)
        if (raw) { resolvedUrn = urn; break }
    }
    if (!raw) {
        throw new Error(`Asset not found: ${tryUrns[0]}`)
    }

    const parsed = parseDotAsset(raw) as ParsedInstalledAsset
    const source = await resolveStudioAssetSource(cwd, resolvedUrn)
    const projectMcpServerNames = Object.keys(await readProjectMcpCatalog(cwd))
    return normalizeAsset(parsed, source, projectMcpServerNames, true)
}

export async function getRegistryAssetDetail(cwd: string, kind: string, author: string, assetPath: string) {
    const [stage, name] = assetPath.includes('/')
        ? assetPath.split(/\/(?=[^/]+$)/)
        : [assetPath, assetPath]
    const pkg = await getRegistryPackage(kind, author, stage, name) as unknown as Record<string, unknown>
    const parsed = parseDotAsset(pkg.payload) as ParsedInstalledAsset
    const projectMcpServerNames = Object.keys(await readProjectMcpCatalog(cwd))

    return {
        ...normalizeAsset(parsed, 'registry', projectMcpServerNames, true),
        ...extractRegistryDetailMeta(pkg),
    }
}

export async function findInstalledDependents(cwd: string, targetUrn: string): Promise<UninstallPlan> {
    const allAssets = await collectAllInstalledAssets(cwd)
    const targetEntry = allAssets.find((entry) => entry.asset.urn === targetUrn)
    if (!targetEntry) {
        throw new Error(`Asset not found: ${targetUrn}`)
    }

    const dependents: UninstallPlanItem[] = []
    const processedUrns = new Set<string>([targetUrn])
    const queue = [targetUrn]

    while (queue.length > 0) {
        const currentUrn = queue.shift()!
        for (const entry of allAssets) {
            if (processedUrns.has(entry.asset.urn)) continue
            const refs = extractReferencedUrns(entry.asset)
            if (!refs.includes(currentUrn)) continue

            processedUrns.add(entry.asset.urn)
            dependents.push({
                urn: entry.asset.urn,
                kind: entry.asset.kind,
                name: assetSlug(entry.asset),
                source: entry.source,
                reason: entry.asset.kind === 'performer'
                    ? `References ${currentUrn.split('/')[0]} "${currentUrn}"`
                    : `Contains performer referencing "${currentUrn}"`,
            })
            queue.push(entry.asset.urn)
        }
    }

    return {
        target: {
            urn: targetEntry.asset.urn,
            kind: targetEntry.asset.kind,
            name: assetSlug(targetEntry.asset),
            source: targetEntry.source,
            reason: 'Target',
        },
        dependents,
    }
}
