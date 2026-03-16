import fs from 'fs/promises'
import path from 'path'
import { assetFilePath, ensureDotDir, getGlobalDotDir } from 'dance-of-tal/lib/registry'
import {
    getPayloadTags,
    loadLocalAssetByUrn,
    parseUrn,
    publishSingleAsset,
    resolveDependencies,
} from 'dance-of-tal/lib/publishing'

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{1,98}[a-z0-9]$/

export type StudioAssetKind = 'tal' | 'dance' | 'performer' | 'act'

type AuthUser = {
    token: string
    username: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
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

function todayIsoDate() {
    return new Date().toISOString().split('T')[0]
}

function normalizeDescription(name: string, value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : name
}

function ensureUrn(value: unknown, kind: StudioAssetKind) {
    if (typeof value !== 'string') {
        throw new Error(`${kind} reference must be a string URN.`)
    }
    const urn = value.trim()
    const parts = urn.split('/')
    if (parts.length !== 3 || parts[0] !== kind || !parts[1].startsWith('@') || !parts[2]) {
        throw new Error(`Invalid URN '${urn}'. Expected ${kind}/@<author>/<name>.`)
    }
    return urn
}

function normalizeTalPayload(author: string, slug: string, payload: Record<string, unknown>) {
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : slug
    const content = typeof payload.content === 'string' ? payload.content : ''
    return {
        type: `tal/@${author}/${slug}`,
        slug,
        name,
        description: normalizeDescription(name, payload.description),
        tags: sanitizeTags(payload.tags),
        featuredScore: typeof payload.featuredScore === 'number' ? payload.featuredScore : 0,
        createdAt: typeof payload.createdAt === 'string' && payload.createdAt.trim() ? payload.createdAt : todayIsoDate(),
        content,
    }
}

function normalizeDancePayload(author: string, slug: string, payload: Record<string, unknown>) {
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : slug
    const content = typeof payload.content === 'string' ? payload.content : ''
    return {
        type: `dance/@${author}/${slug}`,
        slug,
        name,
        description: normalizeDescription(name, payload.description),
        tags: sanitizeTags(payload.tags),
        content,
        ...(isRecord(payload.schema) ? { schema: payload.schema } : {}),
        ...(isRecord(payload.exemplarSet) ? { exemplarSet: payload.exemplarSet } : {}),
    }
}

function normalizePerformerPayload(author: string, slug: string, payload: Record<string, unknown>) {
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : slug
    const danceValue = payload.dance
    const dance = typeof danceValue === 'string'
        ? ensureUrn(danceValue, 'dance')
        : Array.isArray(danceValue)
            ? danceValue.map((value) => ensureUrn(value, 'dance'))
            : undefined
    const tal = payload.tal !== undefined && payload.tal !== null ? ensureUrn(payload.tal, 'tal') : undefined
    const act = payload.act !== undefined && payload.act !== null ? ensureUrn(payload.act, 'act') : undefined

    if (!tal && (!dance || dance.length === 0)) {
        throw new Error("Performer assets require at least one Tal or Dance reference.")
    }

    // Accept model as string ("provider/modelId") or object ({provider, modelId})
    let modelValue: unknown = undefined
    if (typeof payload.model === 'string' && payload.model.trim()) {
        modelValue = payload.model.trim()
    } else if (isRecord(payload.model) && typeof (payload.model as any).provider === 'string') {
        modelValue = payload.model
    }

    return {
        type: `performer/@${author}/${slug}`,
        slug,
        name,
        description: normalizeDescription(name, payload.description),
        tags: sanitizeTags(payload.tags),
        ...(tal ? { tal } : {}),
        ...(dance
            ? { dance: Array.isArray(dance) && dance.length === 1 ? dance[0] : dance }
            : {}),
        ...(act ? { act } : {}),
        ...(modelValue !== undefined ? { model: modelValue } : {}),
        ...(isRecord(payload.mcp_config) ? { mcp_config: payload.mcp_config } : {}),
    }
}

function normalizeActPayload(author: string, slug: string, payload: Record<string, unknown>) {
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : slug

    return {
        type: `act/@${author}/${slug}`,
        schema: 'studio-v1' as const,
        slug,
        name,
        description: normalizeDescription(name, payload.description),
        tags: sanitizeTags(payload.tags),
        performers: Array.isArray(payload.performers) ? payload.performers : [],
        relations: Array.isArray(payload.relations) ? payload.relations : [],
    }
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
            return normalizeDancePayload(author, slug, payloadInput)
        case 'performer':
            return normalizePerformerPayload(author, slug, payloadInput)
        case 'act':
            return normalizeActPayload(author, slug, payloadInput)
    }
}

export async function readDotAuthUser(): Promise<AuthUser | null> {
    try {
        const raw = await fs.readFile(path.join(getGlobalDotDir(), 'auth.json'), 'utf-8')
        const parsed = JSON.parse(raw)
        if (!parsed?.token || !parsed?.username) {
            return null
        }
        return {
            token: String(parsed.token),
            username: sanitizeAuthor(String(parsed.username)),
        }
    } catch {
        return null
    }
}

export async function clearDotAuthUser(): Promise<void> {
    try {
        await fs.unlink(path.join(getGlobalDotDir(), 'auth.json'))
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            throw error
        }
    }
}

export async function saveLocalStudioAsset(options: {
    cwd: string
    kind: StudioAssetKind
    author: string
    slug: string
    payload: unknown
}) {
    const normalized = normalizeStudioAssetPayload(options.kind, options.author, options.slug, options.payload)
    const urn = `${options.kind}/@${sanitizeAuthor(options.author)}/${sanitizeSlug(options.slug)}`

    await ensureDotDir(options.cwd)
    const filePath = assetFilePath(options.cwd, urn)
    await fs.mkdir(path.dirname(filePath), { recursive: true })

    let existed = true
    try {
        await fs.access(filePath)
    } catch {
        existed = false
    }

    await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf-8')

    return {
        urn,
        path: filePath,
        existed,
        payload: normalized,
    }
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
            const published = await publishSingleAsset(parsed.kind, parsed.name, dependency.payload, sanitizeTags(getPayloadTags(dependency.payload)), options.auth.token)
            if (published) {
                dependenciesPublished.push(dependency.urn)
            } else {
                dependenciesSkipped.push(dependency.urn)
            }
        }
    }

    const tags = options.tags && options.tags.length > 0 ? sanitizeTags(options.tags) : sanitizeTags(getPayloadTags(localPayload))
    const mainPublished = await publishSingleAsset(options.kind, slug, localPayload, tags, options.auth.token)
    const urn = `${options.kind}/@${username}/${slug}`

    return {
        urn,
        published: mainPublished,
        dependenciesPublished,
        dependenciesSkipped,
        dependenciesExisting,
    }
}
