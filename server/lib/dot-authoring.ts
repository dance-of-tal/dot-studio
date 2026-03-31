import fs from 'fs/promises'
import path from 'path'
import { assetFilePath, danceAssetDir, ensureDotDir, getGlobalCwd, getRegistryPackage, readAsset } from './dot-source.js'
import {
    buildPublishPlan,
    executePublishPlan,
    existsInRegistry,
    getPayloadTags,
    loadLocalAssetByUrn,
    parseDotAsset,
    parseDotAssetUrn,
} from './dot-source.js'
import { buildCanonicalStudioAssetUrn, stageFromWorkingDir } from '../../shared/publish-stage.js'

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{1,98}[a-z0-9]$/

export type StudioAssetKind = 'tal' | 'dance' | 'performer' | 'act'

type AuthUser = {
    token: string
    username: string
}

type ProvidedPublishAsset = {
    kind: 'tal' | 'performer' | 'act'
    urn: string
    payload: Record<string, unknown>
    tags?: string[]
}

// Re-export auth helpers so dot-service.ts can import from one place
export { readAuthUser as readDotAuthUser, clearAuthUser as clearDotAuthUser } from './dot-source.js'

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

function normalizeDescription(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function ensureUrn(value: unknown, kind: StudioAssetKind) {
    if (typeof value !== 'string') {
        throw new Error(`${kind} reference must be a string URN.`)
    }
    const urn = value.trim()
    try {
        parseDotAssetUrn(urn, kind)
    } catch {
        throw new Error(`Invalid URN '${urn}'. Expected ${kind}/@<owner>/<stage>/<name>.`)
    }
    return urn
}

function finalizeAsset(asset: Record<string, unknown>) {
    return parseDotAsset(asset) as Record<string, unknown>
}

function parseDanceUrn(urn: string) {
    const parts = urn.split('/')
    if (parts.length !== 4 || parts[0] !== 'dance' || !parts[1].startsWith('@')) {
        return null
    }
    return {
        owner: parts[1].slice(1),
        stage: parts[2],
        name: parts[3],
    }
}

async function existsDanceInRegistry(urn: string) {
    const parsed = parseDanceUrn(urn)
    if (!parsed) return false
    try {
        await getRegistryPackage('dance', parsed.owner, parsed.stage, parsed.name)
        return true
    } catch {
        return false
    }
}

async function ensureDanceUrnPublished(cwd: string, urn: string) {
    if (await existsDanceInRegistry(urn)) {
        return
    }

    const local = await readAsset(cwd, urn)
    if (local) {
        throw new Error(`Dance dependency '${urn}' is local-only. Export it from the Dance editor, upload it to GitHub, import it from Asset Library, and then try again.`)
    }

    throw new Error(`Dance dependency '${urn}' is missing from the registry.`)
}

async function ensurePerformerDanceDependencies(cwd: string, payload: Record<string, unknown>) {
    const parsed = parseDotAsset(payload)
    if (parsed.kind !== 'performer') {
        return
    }

    for (const danceUrn of parsed.payload.dances || []) {
        await ensureDanceUrnPublished(cwd, danceUrn)
    }
}

function mapProvidedAssetsByUrn(providedAssets: ProvidedPublishAsset[]) {
    return new Map(providedAssets.map((asset) => [asset.urn, asset]))
}

async function ensureActDanceDependencies(cwd: string, payload: Record<string, unknown>, providedAssets: ProvidedPublishAsset[]) {
    const parsed = parseDotAsset(payload)
    if (parsed.kind !== 'act') {
        return
    }

    const providedAssetsByUrn = mapProvidedAssetsByUrn(providedAssets)

    for (const participant of parsed.payload.participants) {
        const performerUrn = participant.performer
        if (!performerUrn) continue

        const providedPerformer = providedAssetsByUrn.get(performerUrn)
        if (providedPerformer) {
            await ensurePerformerDanceDependencies(cwd, providedPerformer.payload)
            continue
        }

        if (await existsInRegistry(performerUrn)) {
            continue
        }

        const localPerformer = await loadLocalAssetByUrn(cwd, performerUrn)
        if (!localPerformer) {
            throw new Error(`Participant performer dependency '${performerUrn}' is missing from both local assets and the registry.`)
        }

        await ensurePerformerDanceDependencies(cwd, localPerformer)
    }
}

export async function ensurePublishableDependencies(
    cwd: string,
    kind: StudioAssetKind,
    payload: Record<string, unknown>,
    providedAssets: ProvidedPublishAsset[] = [],
) {
    if (kind === 'performer') {
        await ensurePerformerDanceDependencies(cwd, payload)
        return
    }
    if (kind === 'act') {
        await ensureActDanceDependencies(cwd, payload, providedAssets)
    }
}

function normalizeTalPayload(author: string, stage: string, slug: string, payload: Record<string, unknown>) {
    return finalizeAsset({
        kind: 'tal' as const,
        urn: buildCanonicalStudioAssetUrn('tal', author, stage, slug),
        ...(normalizeDescription(payload.description) ? { description: normalizeDescription(payload.description) } : {}),
        tags: sanitizeTags(payload.tags),
        payload: {
            content: typeof payload.content === 'string' ? payload.content : '',
        },
    })
}

function normalizeDancePayload(author: string, stage: string, slug: string, payload: Record<string, unknown>) {
    return finalizeAsset({
        kind: 'dance' as const,
        urn: buildCanonicalStudioAssetUrn('dance', author, stage, slug),
        ...(normalizeDescription(payload.description) ? { description: normalizeDescription(payload.description) } : {}),
        tags: sanitizeTags(payload.tags),
        payload: {
            content: typeof payload.content === 'string' ? payload.content : '',
        },
    })
}

function normalizePerformerPayload(author: string, stage: string, slug: string, payload: Record<string, unknown>) {
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
        kind: 'performer' as const,
        urn: buildCanonicalStudioAssetUrn('performer', author, stage, slug),
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

function normalizeActPayload(author: string, stage: string, slug: string, payload: Record<string, unknown>) {
    return finalizeAsset({
        kind: 'act' as const,
        urn: buildCanonicalStudioAssetUrn('act', author, stage, slug),
        ...(normalizeDescription(payload.description) ? { description: normalizeDescription(payload.description) } : {}),
        tags: sanitizeTags(payload.tags),
        payload: {
            ...(Array.isArray(payload.actRules) ? { actRules: payload.actRules } : {}),
            participants: Array.isArray(payload.participants) ? payload.participants : [],
            relations: Array.isArray(payload.relations) ? payload.relations : [],
        },
    })
}

export function normalizeStudioAssetPayload(kind: StudioAssetKind, authorInput: string, slugInput: string, payloadInput: unknown, stageInput = 'default') {
    if (!isRecord(payloadInput)) {
        throw new Error('Asset payload must be a JSON object.')
    }

    const author = sanitizeAuthor(authorInput)
    const slug = sanitizeSlug(slugInput)
    const stage = sanitizeSlug(stageInput)

    switch (kind) {
        case 'tal':
            return normalizeTalPayload(author, stage, slug, payloadInput)
        case 'dance':
            return normalizeDancePayload(author, stage, slug, payloadInput)
        case 'performer':
            return normalizePerformerPayload(author, stage, slug, payloadInput)
        case 'act':
            return normalizeActPayload(author, stage, slug, payloadInput)
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
    const stage = stageFromWorkingDir(options.cwd)
    const urn = buildCanonicalStudioAssetUrn(options.kind, author, stage, slug)
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
    const normalized = normalizeStudioAssetPayload(options.kind, author, slug, options.payload, stage) as Record<string, unknown>
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
    providedAssets?: ProvidedPublishAsset[]
    auth: AuthUser
}) {
    if (options.kind === 'dance') {
        throw new Error('Dance assets cannot be published via the Studio registry pipeline. Export the draft, upload it to GitHub, and import it from Asset Library as Dance.')
    }

    const slug = sanitizeSlug(options.slug)
    const username = sanitizeAuthor(options.auth.username)
    const stage = stageFromWorkingDir(options.cwd)
    const urn = buildCanonicalStudioAssetUrn(options.kind, username, stage, slug)
    const providedAssets = (options.providedAssets || []).map((asset) => {
        const parsed = parseDotAsset(asset.payload)
        if (parsed.kind === 'dance') {
            throw new Error('Dance assets are not accepted as Studio publish dependencies.')
        }
        if (parsed.kind !== asset.kind) {
            throw new Error(`Provided asset '${asset.urn}' kind does not match its payload.`)
        }
        if (parsed.urn !== asset.urn) {
            throw new Error(`Provided asset '${asset.urn}' does not match payload URN '${parsed.urn}'.`)
        }

        const parsedUrn = parseDotAssetUrn(asset.urn, asset.kind)
        if (parsedUrn.owner.toLowerCase() !== username.toLowerCase()) {
            throw new Error(`Provided asset '${asset.urn}' must belong to @${username}.`)
        }

        return {
            kind: asset.kind,
            urn: parsed.urn,
            payload: parsed as Record<string, unknown>,
            tags: sanitizeTags(asset.tags).length > 0
                ? sanitizeTags(asset.tags)
                : sanitizeTags(getPayloadTags(parsed as Record<string, unknown>)),
        }
    })
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
        const existing = await loadLocalAssetByUrn(options.cwd, urn)
        if (!existing) {
            throw new Error(`Local asset '${urn}' was not found. Save it locally before publishing.`)
        }
        localPayload = existing
    }

    await ensurePublishableDependencies(options.cwd, options.kind, localPayload, providedAssets)

    const tags = options.tags && options.tags.length > 0 ? sanitizeTags(options.tags) : sanitizeTags(getPayloadTags(localPayload))
    const publishKind = options.kind as 'tal' | 'performer' | 'act'
    const plan = await buildPublishPlan({
        cwd: options.cwd,
        username,
        root: {
            kind: publishKind,
            urn,
            payload: localPayload,
            tags,
        },
        providedAssets: Object.fromEntries(
            providedAssets.map((asset) => [asset.urn, asset]),
        ),
    })
    const publishResult = await executePublishPlan(plan, options.auth.token)

    return {
        urn,
        published: publishResult.rootPublished,
        dependenciesPublished: publishResult.published.filter((entryUrn) => entryUrn !== urn),
        dependenciesSkipped: publishResult.skipped.filter((entryUrn) => entryUrn !== urn),
        dependenciesExisting: publishResult.existing,
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
