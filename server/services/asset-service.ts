import fs from 'fs/promises'
import path from 'path'
import { assetFilePath, getDotDir, getGlobalCwd, getGlobalDotDir, getRegistryPackage, readAsset } from '../lib/dot-source.js'
import type { AssetListItem } from '../../shared/asset-contracts.js'

export function isStudioActPayload(content: Record<string, any>) {
    return content.schema === 'studio-v1' || Array.isArray(content.participants) || Array.isArray(content.payload?.participants)
}

function resolvePayload(content: Record<string, any>) {
    return content && typeof content.payload === 'object' && content.payload !== null
        ? content.payload as Record<string, any>
        : content
}

function normalizeAsset(
    kind: string,
    urn: string,
    author: string,
    source: 'global' | 'stage' | 'registry',
    content: Record<string, any>,
    detail = false,
): AssetListItem {
    const slug = urn.split('/')[2]
    const normalizedAuthor = author.startsWith('@') ? author : `@${author}`
    const payload = resolvePayload(content)
    const base = {
        kind,
        urn,
        slug,
        name: slug,
        author: normalizedAuthor,
        source,
        description: typeof content.description === 'string' ? content.description : '',
    }

    if (kind === 'performer') {
        const danceRaw = payload.dances ?? payload.dance
        const danceUrns = Array.isArray(danceRaw)
            ? danceRaw.filter((value: unknown): value is string => typeof value === 'string')
            : typeof danceRaw === 'string'
                ? [danceRaw]
                : []
        const modelValue = typeof payload.model === 'string' ? payload.model
            : (payload.model && typeof payload.model === 'object' && 'provider' in payload.model && typeof payload.model.provider === 'string')
                ? payload.model
                : null
        return {
            ...base,
            talUrn: typeof payload.tal === 'string' ? payload.tal : null,
            danceUrns,
            actUrn: typeof payload.act === 'string' ? payload.act : null,
            model: modelValue,
            mcpConfig:
                typeof payload.mcp_config === 'object' && payload.mcp_config !== null
                    ? payload.mcp_config
                    : typeof payload.mcp === 'object' && payload.mcp !== null
                        ? payload.mcp
                        : null,
            tags: Array.isArray(content.tags) ? content.tags : [],
            ...(typeof content.$schema === 'string' ? { schema: content.$schema } : {}),
        }
    }

    if (kind === 'act') {
        return {
            ...base,
            tags: Array.isArray(content.tags) ? content.tags : [],
            schema: typeof content.$schema === 'string' ? content.$schema : 'studio-v1',
            participantCount: Array.isArray(payload.participants) ? payload.participants.length : 0,
            relationCount: Array.isArray(payload.relations) ? payload.relations.length : 0,
            ...(Array.isArray(payload.actRules) ? { actRules: payload.actRules } : {}),
            ...(detail ? {
                ...(Array.isArray(payload.actRules) ? { actRules: payload.actRules } : {}),
                participants: Array.isArray(payload.participants) ? payload.participants : [],
                relations: Array.isArray(payload.relations) ? payload.relations : [],
            } : {}),
        }
    }

    return {
        ...base,
        tags: Array.isArray(content.tags) ? content.tags : [],
        ...(typeof content.$schema === 'string' ? { schema: content.$schema } : {}),
        ...(detail && typeof payload.content === 'string' ? { content: payload.content } : {}),
    }
}

async function scanAssetDir(baseDir: string, kind: string, source: 'global' | 'stage', resultsMap: Map<string, AssetListItem>) {
    const kindDir = path.join(baseDir, 'assets', kind)
    try {
        const authors = await fs.readdir(kindDir)
        for (const author of authors) {
            if (!author.startsWith('@')) continue
            const authorDir = path.join(kindDir, author)
            const stat = await fs.stat(authorDir)
            if (!stat.isDirectory()) continue

            const files = await fs.readdir(authorDir)
            for (const file of files) {
                if (!file.endsWith('.json')) continue
                try {
                    const content = JSON.parse(await fs.readFile(path.join(authorDir, file), 'utf-8'))
                    const name = file.replace(/\.json$/, '')
                    const urn = `${kind}/${author}/${name}`
                    resultsMap.set(urn, normalizeAsset(kind, urn, author, source, content, false))
                } catch {
                    // skip invalid files
                }
            }
        }
    } catch {
        // directory doesn't exist
    }
}

export async function listStudioAssets(cwd: string, kind: string): Promise<AssetListItem[]> {
    const resultsMap = new Map<string, AssetListItem>()
    await scanAssetDir(getGlobalDotDir(), kind, 'global', resultsMap)
    await scanAssetDir(getDotDir(cwd), kind, 'stage', resultsMap)
    return Array.from(resultsMap.values())
}

export async function resolveStudioAssetSource(cwd: string, urn: string): Promise<'global' | 'stage'> {
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

export async function getStudioAsset(cwd: string, kind: string, author: string, name: string) {
    const urn = `${kind}/@${author}/${name}`
    const asset = await readAsset(cwd, urn)
    if (!asset) {
        throw new Error(`Asset not found: ${urn}`)
    }
    const source = await resolveStudioAssetSource(cwd, urn)
    return normalizeAsset(kind, urn, `@${author}`, source, asset, true)
}

export async function getRegistryAssetDetail(kind: string, author: string, name: string) {
    const pkg = await getRegistryPackage(kind, author, name)
    const urn = typeof pkg.urn === 'string' && pkg.urn ? pkg.urn : `${kind}/@${author.replace(/^@/, '')}/${name}`
    return {
        ...normalizeAsset(kind, urn, `@${author.replace(/^@/, '')}`, 'registry', pkg.payload, true),
        stars: typeof pkg.stars === 'number' ? pkg.stars : 0,
        tier: typeof pkg.tier === 'string' ? pkg.tier : undefined,
        updatedAt: typeof pkg.updatedAt === 'string' ? pkg.updatedAt : undefined,
    }
}
