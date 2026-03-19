import fs from 'fs/promises'
import path from 'path'
import { assetFilePath, getDotDir, getGlobalCwd, getGlobalDotDir, readAsset } from 'dance-of-tal/lib/registry'
import { getRegistryPackage } from 'dance-of-tal/lib/installer'
import type { AssetListItem } from '../../shared/asset-contracts.js'

export function isStudioActPayload(content: Record<string, any>) {
    return content.schema === 'studio-v1' || Array.isArray(content.participants)
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
    const base = {
        kind,
        urn,
        slug,
        name: typeof content.name === 'string' && content.name.trim() ? content.name.trim() : slug,
        author: normalizedAuthor,
        source,
        description: typeof content.description === 'string' ? content.description : '',
    }

    if (kind === 'performer') {
        const danceRaw = content.dance
        const danceUrns = Array.isArray(danceRaw)
            ? danceRaw.filter((value: unknown): value is string => typeof value === 'string')
            : typeof danceRaw === 'string'
                ? [danceRaw]
                : []
        // Accept model as string or object {provider, modelId}
        const modelValue = typeof content.model === 'string' ? content.model
            : (content.model && typeof content.model === 'object' && 'provider' in content.model && typeof content.model.provider === 'string')
                ? content.model
                : null
        return {
            ...base,
            talUrn: typeof content.tal === 'string' ? content.tal : null,
            danceUrns,
            actUrn: typeof content.act === 'string' ? content.act : null,
            model: modelValue,
            mcpConfig: typeof content.mcp_config === 'object' && content.mcp_config !== null ? content.mcp_config : null,
            tags: Array.isArray(content.tags) ? content.tags : [],
        }
    }

    if (kind === 'act') {
        return {
            ...base,
            tags: Array.isArray(content.tags) ? content.tags : [],
            schema: 'studio-v1',
            participantCount: Array.isArray(content.participants) ? content.participants.length : 0,
            relationCount: Array.isArray(content.relations) ? content.relations.length : 0,
            ...(detail ? {
                participants: Array.isArray(content.participants) ? content.participants : [],
                relations: Array.isArray(content.relations) ? content.relations : [],
            } : {}),
        }
    }

    return {
        ...base,
        tags: Array.isArray(content.tags) ? content.tags : [],
        ...(detail && typeof content.content === 'string' ? { content: content.content } : {}),
    }
}

async function scanAssetDir(baseDir: string, kind: string, source: 'global' | 'stage', resultsMap: Map<string, AssetListItem>) {
    const kindDir = path.join(baseDir, kind)
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
