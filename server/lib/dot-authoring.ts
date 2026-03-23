import fs from 'fs/promises'
import path from 'path'
import { assetFilePath, danceAssetDir, ensureDotDir, getGlobalCwd } from './dot-source.js'
import {
    getPayloadTags,
    loadLocalAssetByUrn,
    parseDotAsset,
    parseUrn,
    publishSingleAsset,
    resolveDependencies,
} from './dot-source.js'

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{1,98}[a-z0-9]$/

export type StudioAssetKind = 'tal' | 'dance' | 'performer' | 'act'

type AuthUser = {
    token: string
    username: string
}

// Re-export auth helpers so dot-service.ts can import from one place
export { readAuthUser as readDotAuthUser, clearAuthUser as clearDotAuthUser } from './dot-source.js'

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Derives the URN stage from the working directory.
 * Uses the sanitized basename of the cwd (e.g. /projects/my-app → my-app).
 */
function stageFromCwd(cwd: string): string {
    const base = path.basename(cwd)
    // Sanitize to lowercase slug format
    return base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'default'
}

function sanitizeSlug(value: string) {
    const slug = value.trim()
    if (!SLUG_RE.test(slug)) {
        throw new Error('Slug must use lowercase letters, numbers, dots, underscores, or hyphens (2-100 chars).')
    }
    return slug
}

function sanitizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
}

function sanitizeAuthor(value: string) {
    const author = value.trim().replace(/^@/, '')
    if (!author) {
        throw new Error('Author is required.')
    }
    return author
}

function normalizeDescription(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function ensureUrn(value: unknown, kind: StudioAssetKind) {
    if (typeof value !== 'string') {
        throw new Error(`${kind} reference must be a string URN.`)
    }
    const urn = value.trim()
    const parts = urn.split('/')
    // Accept both 3-segment (kind/@owner/name) and 4-segment (kind/@owner/stage/name)
    const validLength = parts.length === 3 || parts.length === 4
    if (!validLength || parts[0] !== kind || !parts[1].startsWith('@') || !parts[parts.length - 1]) {
        throw new Error(`Invalid URN '${urn}'. Expected ${kind}/@<owner>/<name> or ${kind}/@<owner>/<stage>/<name>.`)
    }
    return urn
}

function finalizeAsset(asset: Record<string, unknown>) {
    return parseDotAsset(asset) as Record<string, unknown>
}

function normalizeTalPayload(author: string, slug: string, payload: Record<string, unknown>) {
    return finalizeAsset({
        $schema: 'https://schemas.danceoftal.com/assets/tal.v1.json' as const,
        kind: 'tal' as const,
        urn: `tal/@${author}/${slug}`,
        ...(normalizeDescription(payload.description) ? { description: normalizeDescription(payload.description) } : {}),
        tags: sanitizeTags(payload.tags),
        payload: {
            content: typeof payload.content === 'string' ? payload.content : '',
        },
    })
}

function normalizeDancePayload(author: string, stage: string, slug: string, payload: Record<string, unknown>) {
    return finalizeAsset({
        $schema: 'https://schemas.danceoftal.com/assets/dance.v1.json' as const,
        kind: 'dance' as const,
        urn: `dance/@${author}/${stage}/${slug}`,
        ...(normalizeDescription(payload.description) ? { description: normalizeDescription(payload.description) } : {}),
        tags: sanitizeTags(payload.tags),
        payload: {
            content: typeof payload.content === 'string' ? payload.content : '',
        },
    })
}

function normalizePerformerPayload(author: string, slug: string, payload: Record<string, unknown>) {
    const dances = Array.isArray(payload.dances)
        ? payload.dances.map((value) => ensureUrn(value, 'dance'))
        : undefined
    const tal = payload.tal !== undefined && payload.tal !== null ? ensureUrn(payload.tal, 'tal') : undefined

    let modelValue: unknown = undefined
    if (
        isRecord(payload.model)
        && typeof payload.model.provider === 'string'
        && typeof payload.model.modelId === 'string'
    ) {
        modelValue = payload.model
    }

    return finalizeAsset({
        $schema: 'https://schemas.danceoftal.com/assets/performer.v1.json' as const,
        kind: 'performer' as const,
        urn: `performer/@${author}/${slug}`,
        ...(normalizeDescription(payload.description) ? { description: normalizeDescription(payload.description) } : {}),
        tags: sanitizeTags(payload.tags),
        payload: {
            ...(tal ? { tal } : {}),
            ...(dances ? { dances } : {}),
            ...(modelValue !== undefined ? { model: modelValue } : {}),
            ...(typeof payload.modelVariant === 'string' && payload.modelVariant.trim() ? { modelVariant: payload.modelVariant.trim() } : {}),
            ...(isRecord(payload.mcp_config) ? { mcp_config: payload.mcp_config } : {}),
        },
    })
}

function normalizeActPayload(author: string, slug: string, payload: Record<string, unknown>) {
    return finalizeAsset({
        $schema: 'https://schemas.danceoftal.com/assets/act.v1.json' as const,
        kind: 'act' as const,
        urn: `act/@${author}/${slug}`,
        ...(normalizeDescription(payload.description) ? { description: normalizeDescription(payload.description) } : {}),
        tags: sanitizeTags(payload.tags),
        payload: {
            ...(Array.isArray(payload.actRules) ? { actRules: payload.actRules } : {}),
            participants: Array.isArray(payload.participants) ? payload.participants : [],
            relations: Array.isArray(payload.relations) ? payload.relations : [],
        },
    })
}

export function normalizeStudioAssetPayload(kind: StudioAssetKind, authorInput: string, slugInput: string, payloadInput: unknown) {
    if (!isRecord(payloadInput)) {
        throw new Error('Asset payload must be a JSON object.')
    }

    const author = sanitizeAuthor(authorInput)
    const slug = sanitizeSlug(slugInput)

    switch (kind) {
        case 'tal':
            return normalizeTalPayload(author, slug, payloadInput)
        case 'dance':
            // Dance URN requires a stage — caller must pass stage in slug as 'stage/name'
            // or use saveLocalStudioAsset which derives stage from cwd
            return normalizeDancePayload(author, 'default', slug, payloadInput)
        case 'performer':
            return normalizePerformerPayload(author, slug, payloadInput)
        case 'act':
            return normalizeActPayload(author, slug, payloadInput)
    }
}


export async function saveLocalStudioAsset(options: {
    cwd: string
    kind: StudioAssetKind
    author: string
    slug: string
    payload: unknown
}) {
    const author = sanitizeAuthor(options.author)
    const slug = sanitizeSlug(options.slug)
    const stage = stageFromCwd(options.cwd)
    // All Studio assets use 4-segment URN: kind/@author/stage/name
    const urn = `${options.kind}/@${author}/${stage}/${slug}`
    await ensureDotDir(options.cwd)

    if (options.kind === 'dance') {
        // Dance is a bundle directory — write SKILL.md with proper frontmatter
        const bundleDir = danceAssetDir(options.cwd, urn)
        const skillMdPath = path.join(bundleDir, 'SKILL.md')
        await fs.mkdir(bundleDir, { recursive: true })

        if (!isRecord(options.payload)) {
            throw new Error('Dance payload must be a JSON object.')
        }
        const content = typeof options.payload.content === 'string' ? options.payload.content : ''
        const description = typeof options.payload.description === 'string' ? options.payload.description : ''
        const frontmatter = [
            '---',
            `name: ${JSON.stringify(slug)}`,
            ...(description ? [`description: ${JSON.stringify(description)}`] : []),
            '---',
        ].join('\n')
        const skillMdContent = `${frontmatter}\n\n${content}`

        let existed = true
        try {
            await fs.access(skillMdPath)
        } catch {
            existed = false
        }

        await fs.writeFile(skillMdPath, skillMdContent, 'utf-8')
        return { urn, path: skillMdPath, existed, payload: options.payload as Record<string, unknown> }
    }

    // Tal / Performer / Act — JSON file with 4-segment URN embedded
    const normalized = normalizeStudioAssetPayload(options.kind, author, slug, options.payload) as Record<string, unknown>
    // Override the URN embedded in the normalized payload to be 4-segment
    ;(normalized as Record<string, unknown>).urn = urn
    const filePath = assetFilePath(options.cwd, urn)
    await fs.mkdir(path.dirname(filePath), { recursive: true })

    let existed = true
    try {
        await fs.access(filePath)
    } catch {
        existed = false
    }

    await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf-8')

    return { urn, path: filePath, existed, payload: normalized }
}

export async function publishStudioAsset(options: {
    cwd: string
    kind: StudioAssetKind
    slug: string
    payload?: unknown
    tags?: string[]
    auth: AuthUser
}) {
    const slug = sanitizeSlug(options.slug)
    const username = sanitizeAuthor(options.auth.username)
    let localPayload: Record<string, unknown>

    if (options.payload !== undefined) {
        const saved = await saveLocalStudioAsset({
            cwd: options.cwd,
            kind: options.kind,
            author: username,
            slug,
            payload: options.payload,
        })
        localPayload = saved.payload
    } else {
        const urn = `${options.kind}/@${username}/${slug}`
        const existing = await loadLocalAssetByUrn(options.cwd, urn)
        if (!existing) {
            throw new Error(`Local asset '${urn}' was not found. Save it locally before publishing.`)
        }
        localPayload = existing
    }

    const dependenciesPublished: string[] = []
    const dependenciesSkipped: string[] = []
    const dependenciesExisting: string[] = []

    if (options.kind === 'performer' || options.kind === 'act') {
        const dependencies = await resolveDependencies(options.cwd, options.kind, localPayload, username)
        const foreignMissing = dependencies.filter((dep) => dep.status === 'foreign_missing')
        if (foreignMissing.length > 0) {
            throw new Error(
                `Cannot publish because some dependencies are missing from the registry and belong to other authors: ${foreignMissing.map((dep) => dep.urn).join(', ')}.`
            )
        }

        for (const dependency of dependencies) {
            if (dependency.status === 'exists') {
                dependenciesExisting.push(dependency.urn)
                continue
            }
            if (!dependency.payload) {
                continue
            }

            const parsed = parseUrn(dependency.urn)
            if (!parsed) {
                continue
            }
            const published = await publishSingleAsset(parsed.kind, parsed.stage, parsed.name, dependency.payload, sanitizeTags(getPayloadTags(dependency.payload)), options.auth.token)
            if (published) {
                dependenciesPublished.push(dependency.urn)
            } else {
                dependenciesSkipped.push(dependency.urn)
            }
        }
    }

    // Dance assets are not publishable through the Studio registry pipeline
    if (options.kind === 'dance') {
        throw new Error('Dance assets cannot be published via the Studio registry pipeline. Use `dot add` to register from GitHub.')
    }

    const publishKind = options.kind as 'tal' | 'performer' | 'act'
    // publishStudioAsset receives `options.slug` which is name only; stage is embedded in URN.
    // For the studio, all assets use the stage from `parseUrn` of the built URN.
    // The registry API needs (kind, stage, name, ...) — stage is the slug middle segment.
    // Studio draft slugs are simple (no stage prefix), so we use the username as the stage owner.
    // For now stage == slug to maintain backward compat (studio always publishes to the user's root stage).
    const tags = options.tags && options.tags.length > 0 ? sanitizeTags(options.tags) : sanitizeTags(getPayloadTags(localPayload))
    const publishUrn = parseUrn(`${publishKind}/@${username}/${slug}`)
    const publishStage = publishUrn?.stage ?? slug
    const mainPublished = await publishSingleAsset(publishKind, publishStage, slug, localPayload, tags, options.auth.token)
    const urn = `${options.kind}/@${username}/${slug}`

    return {
        urn,
        published: mainPublished,
        dependenciesPublished,
        dependenciesSkipped,
        dependenciesExisting,
    }
}

export async function uninstallStudioAsset(cwd: string, urn: string) {
    const [kind] = urn.split('/')

    if (kind === 'dance') {
        // Dance is a directory bundle — remove the whole directory
        const tryRemoveDir = async (dir: string) => {
            try {
                await fs.access(dir)
                await fs.rm(dir, { recursive: true, force: true })
                return true
            } catch {
                return false
            }
        }

        if (await tryRemoveDir(danceAssetDir(cwd, urn))) {
            return { urn, scope: 'stage' as const }
        }
        if (await tryRemoveDir(danceAssetDir(getGlobalCwd(), urn))) {
            return { urn, scope: 'global' as const }
        }
        throw new Error(`Dance asset not found: ${urn}`)
    }

    // Tal / Performer / Act — single JSON file
    const stagePath = assetFilePath(cwd, urn)
    try {
        await fs.access(stagePath)
        await fs.unlink(stagePath)
        return { urn, scope: 'stage' as const }
    } catch {
        // Not found in stage, try global
    }

    const globalPath = assetFilePath(getGlobalCwd(), urn)
    try {
        await fs.access(globalPath)
        await fs.unlink(globalPath)
        return { urn, scope: 'global' as const }
    } catch {
        throw new Error(`Asset not found: ${urn}`)
    }
}
