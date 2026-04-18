import fs from 'fs/promises'
import path from 'path'

import type { AssetListItem, GitHubDanceSourceInfo } from '../../shared/asset-contracts.js'
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
    parseDotAssetUrn,
    readAsset,
} from '../lib/dot-source.js'
import { readGlobalMcpCatalog } from '../lib/mcp-catalog.js'
import { resolvePerformerMcpPortability } from '../../shared/performer-mcp-portability.js'
import { readGitHubDanceSourceMap } from './dance-github-source.js'

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

function assetSlug(asset: ParsedInstalledAsset) {
    return parseDotAssetUrn(asset.urn).name
}

function assetAuthor(asset: ParsedInstalledAsset) {
    return `@${parseDotAssetUrn(asset.urn).owner}`
}

function assetSchema(asset: ParsedInstalledAsset) {
    return (asset as ParsedInstalledAsset & { $schema?: string }).$schema
}

function normalizeAsset(
    asset: ParsedInstalledAsset,
    source: 'global' | 'stage' | 'registry',
    availableMcpServerNames: string[],
    githubSource: GitHubDanceSourceInfo | null,
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
                ...(githubSource ? { github: githubSource } : {}),
                ...(detail ? { content: asset.payload.content } : {}),
            }
        case 'performer': {
            const portability = resolvePerformerMcpPortability(
                asset.payload.mcp_config,
                availableMcpServerNames,
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
                matchedMcpServerNames: portability.matchedMcpServerNames,
                missingMcpServerNames: portability.missingMcpServerNames,
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
    cwd: string,
    kind: ParsedInstalledAsset['kind'],
    source: 'global' | 'stage',
    resultsMap: Map<string, AssetListItem>,
    availableMcpServerNames: string[],
    githubSources: Map<string, GitHubDanceSourceInfo>,
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
                        const parsed = await readAsset(cwd, urn)
                        if (!parsed) continue
                        try {
                            const asset = parseDotAsset(parsed) as ParsedInstalledAsset
                            resultsMap.set(asset.urn, normalizeAsset(asset, source, availableMcpServerNames, githubSources.get(asset.urn) || null, false))
                        } catch {
                            // invalid asset, skip
                        }
                    }
                }
            } else {
                // Tal / Performer / Act: @owner/stage/name.json
                const stages = await fs.readdir(authorDir)
                for (const stage of stages) {
                    const stageDir = path.join(authorDir, stage)
                    const stageStat = await fs.stat(stageDir).catch(() => null)
                    if (!stageStat?.isDirectory()) continue
                    const files = await fs.readdir(stageDir)
                    for (const file of files) {
                        if (!file.endsWith('.json')) continue
                        const parsed = await parseInstalledAssetFile(path.join(stageDir, file))
                        if (!parsed || parsed.kind !== kind) continue
                        resultsMap.set(parsed.urn, normalizeAsset(parsed, source, availableMcpServerNames, null, false))
                    }
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
        { dir: getGlobalDotDir(), cwd: getGlobalCwd(), source: 'global' as const },
        { dir: getDotDir(cwd), cwd, source: 'stage' as const },
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
                                const parsed = await readAsset(scope.cwd, urn)
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
                        // Tal / Performer / Act: @owner/stage/name.json
                        const stages = await fs.readdir(authorDir)
                        for (const stage of stages) {
                            const stageDir = path.join(authorDir, stage)
                            const stageStat = await fs.stat(stageDir).catch(() => null)
                            if (!stageStat?.isDirectory()) continue
                            const files = await fs.readdir(stageDir)
                            for (const file of files) {
                                if (!file.endsWith('.json')) continue
                                const parsed = await parseInstalledAssetFile(path.join(stageDir, file))
                                if (!parsed || parsed.kind !== kind) continue
                                entries.push({ asset: parsed, source: scope.source })
                            }
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
    const availableMcpServerNames = Object.keys(await readGlobalMcpCatalog())
    const [globalGithubSources, stageGithubSources] = kind === 'dance'
        ? await Promise.all([
            readGitHubDanceSourceMap(getGlobalCwd()),
            readGitHubDanceSourceMap(cwd),
        ])
        : [new Map<string, GitHubDanceSourceInfo>(), new Map<string, GitHubDanceSourceInfo>()]

    await scanAssetDir(getGlobalDotDir(), getGlobalCwd(), kind, 'global', resultsMap, availableMcpServerNames, globalGithubSources)
    await scanAssetDir(getDotDir(cwd), cwd, kind, 'stage', resultsMap, availableMcpServerNames, stageGithubSources)
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

function parseCanonicalAssetPath(assetPath: string) {
    const [stage, name, ...rest] = String(assetPath || '').trim().split('/').filter(Boolean)
    if (!stage || !name || rest.length > 0) {
        throw new Error("Asset path must use canonical '<stage>/<name>' format.")
    }
    return { stage, name }
}

export async function getStudioAsset(cwd: string, kind: string, author: string, assetPath: string) {
    const { stage, name } = parseCanonicalAssetPath(assetPath)
    const resolvedUrn = `${kind}/@${author}/${stage}/${name}`
    const raw = await readAsset(cwd, resolvedUrn)
    if (!raw) {
        throw new Error(`Asset not found: ${resolvedUrn}`)
    }

    const parsed = parseDotAsset(raw) as ParsedInstalledAsset
    const source = await resolveStudioAssetSource(cwd, resolvedUrn)
    const availableMcpServerNames = Object.keys(await readGlobalMcpCatalog())
    const githubSources = parsed.kind === 'dance'
        ? await readGitHubDanceSourceMap(source === 'global' ? getGlobalCwd() : cwd)
        : new Map<string, GitHubDanceSourceInfo>()
    return normalizeAsset(parsed, source, availableMcpServerNames, githubSources.get(resolvedUrn) || null, true)
}

export async function getRegistryAssetDetail(_cwd: string, kind: string, author: string, assetPath: string) {
    const { stage, name } = parseCanonicalAssetPath(assetPath)
    const pkg = await getRegistryPackage(kind, author, stage, name) as unknown as Record<string, unknown>
    const parsed = parseDotAsset(pkg.payload) as ParsedInstalledAsset
    const availableMcpServerNames = Object.keys(await readGlobalMcpCatalog())

    return {
        ...normalizeAsset(parsed, 'registry', availableMcpServerNames, null, true),
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
