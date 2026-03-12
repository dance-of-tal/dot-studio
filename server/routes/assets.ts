// Asset Routes — using DOT lib directly

import { Hono } from 'hono'
import fs from 'fs/promises'
import path from 'path'
import { assetFilePath, getDotDir, getGlobalCwd, getGlobalDotDir, readAsset } from 'dance-of-tal/lib/registry'
import { getRegistryPackage } from 'dance-of-tal/lib/installer'
import { cached, TTL } from '../lib/cache.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'

const assets = new Hono()

// ── Asset Scanning ──────────────────────────────────────
// Scans both local (.dance-of-tal/) and global (~/.dance-of-tal/) dirs
// Each asset is tagged with source: 'global' | 'stage'
// Stage assets override global for the same URN

function normalizeAsset(
    kind: string,
    urn: string,
    author: string,
    source: 'global' | 'stage' | 'registry',
    content: Record<string, any>,
    detail = false,
) {
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
        return {
            ...base,
            talUrn: typeof content.tal === 'string' ? content.tal : null,
            danceUrns,
            actUrn: typeof content.act === 'string' ? content.act : null,
            model: typeof content.model === 'string' ? content.model : null,
            mcpConfig: typeof content.mcp_config === 'object' && content.mcp_config !== null ? content.mcp_config : null,
            tags: Array.isArray(content.tags) ? content.tags : [],
        }
    }

    if (kind === 'act') {
        return {
            ...base,
            entryNode: typeof content.entryNode === 'string' ? content.entryNode : null,
            nodeCount: typeof content.nodes === 'object' && content.nodes ? Object.keys(content.nodes).length : 0,
            tags: Array.isArray(content.tags) ? content.tags : [],
            ...(detail ? {
                nodes: typeof content.nodes === 'object' && content.nodes ? content.nodes : {},
                edges: Array.isArray(content.edges) ? content.edges : [],
                maxIterations: typeof content.maxIterations === 'number' ? content.maxIterations : undefined,
            } : {}),
        }
    }

    return {
        ...base,
        tags: Array.isArray(content.tags) ? content.tags : [],
        ...(detail && typeof content.content === 'string' ? { content: content.content } : {}),
    }
}

async function fetchRegistryAsset(kind: string, author: string, name: string) {
    const pkg = await getRegistryPackage(kind, author, name)
    const urn = typeof pkg.urn === 'string' && pkg.urn ? pkg.urn : `${kind}/@${author.replace(/^@/, '')}/${name}`
    const normalized = normalizeAsset(
        kind,
        urn,
        `@${author.replace(/^@/, '')}`,
        'registry',
        pkg.payload,
        true,
    )

    return {
        ...normalized,
        stars: typeof pkg.stars === 'number' ? pkg.stars : 0,
        tier: typeof pkg.tier === 'string' ? pkg.tier : undefined,
        updatedAt: typeof pkg.updatedAt === 'string' ? pkg.updatedAt : undefined,
    }
}

async function scanAssetDir(baseDir: string, kind: string, source: 'global' | 'stage', resultsMap: Map<string, any>) {
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
                } catch { /* skip invalid files */ }
            }
        }
    } catch { /* directory doesn't exist */ }
}

async function listAssets(cwd: string, kind: string): Promise<any[]> {
    const resultsMap = new Map<string, any>()
    const globalDir = getGlobalDotDir()
    const localDir = getDotDir(cwd)

    // 1. Scan Global Directory (Base)
    await scanAssetDir(globalDir, kind, 'global', resultsMap)
    // 2. Scan Stage Directory (Overrides)
    await scanAssetDir(localDir, kind, 'stage', resultsMap)

    return Array.from(resultsMap.values())
}

async function resolveAssetSource(cwd: string, urn: string): Promise<'global' | 'stage'> {
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

// ── Routes ──────────────────────────────────────────────
assets.get('/api/assets/:kind', async (c) => {
    const kind = c.req.param('kind')
    if (!['tal', 'dance', 'performer', 'act'].includes(kind)) {
        return c.json({ error: `Invalid kind: ${kind}` }, 400)
    }
    const cwd = resolveRequestWorkingDir(c)
    const assetList = await cached(`assets-${kind}-${cwd}`, TTL.ASSETS, () => listAssets(cwd, kind))
    return c.json(assetList)
})

assets.get('/api/assets/:kind/:author/:name', async (c) => {
    const { kind, author, name } = c.req.param()
    const urn = `${kind}/@${author}/${name}`
    try {
        const cwd = resolveRequestWorkingDir(c)
        const asset = await readAsset(cwd, urn)
        if (!asset) {
            return c.json({ error: `Asset not found: ${urn}` }, 404)
        }
        const source = await resolveAssetSource(cwd, urn)
        return c.json(normalizeAsset(kind, urn, `@${author}`, source, asset, true))
    } catch (err: any) {
        return c.json({ error: err.message }, 404)
    }
})

assets.get('/api/assets/registry/:kind/:author/:name', async (c) => {
    const { kind, author, name } = c.req.param()
    try {
        const detail = await cached(`registry-asset-${kind}-${author}-${name}`, TTL.PROVIDERS, () =>
            fetchRegistryAsset(kind, author, name),
        )
        return c.json(detail)
    } catch (err: any) {
        return c.json({ error: err.message }, 404)
    }
})

export default assets
