import fs from 'fs/promises'
import { ensureDotDir, getDotDir, getGlobalCwd, getGlobalDotDir, getPerformer, initRegistry, installActWithDependencies, installAsset, installPerformerAndLock, listLockedPerformerNames, readAgentManifest, searchRegistry, writeAgentManifest } from '../lib/dot-source.js'
import type { Performer } from '../lib/dot-source.js'
import { clearDotAuthUser, publishStudioAsset, readDotAuthUser, saveLocalStudioAsset, type StudioAssetKind } from '../lib/dot-authoring.js'
import { startDotLogin } from '../lib/dot-login.js'
import { invalidate } from '../lib/cache.js'

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

export async function listDotPerformers(cwd: string) {
    return listLockedPerformerNames(cwd)
}

export async function getDotPerformer(cwd: string, name: string) {
    return getPerformer(cwd, name)
}

export async function getDotAgentManifest(cwd: string) {
    return readAgentManifest(cwd)
}

export async function saveDotAgentManifest(cwd: string, manifest: Record<string, string>) {
    await writeAgentManifest(cwd, manifest)
    return { ok: true as const }
}

export async function searchDotRegistry(query: string, options: { kind?: string | null; limit: number }) {
    return searchRegistry(query, {
        kind: options.kind || undefined,
        limit: options.limit,
    })
}

/** Validates that performer URNs follow the 3-part format: kind/@author/name */
export function validateDotPerformer(performer: Performer): void {
    const tal = performer.tal ?? null
    const dances = performer.dance
        ? (Array.isArray(performer.dance) ? performer.dance : [performer.dance])
        : []

    if (!tal && dances.length === 0) {
        throw new Error("Invalid performer: at least one of 'tal' or 'dance' must be present.")
    }

    const validateUrn = (urn: string, prefix: string) => {
        const parts = urn.split('/')
        if (parts.length !== 3 || parts[0] !== prefix || !parts[1].startsWith('@') || !parts[2]) {
            throw new Error(`Invalid URN: '${urn}'. Expected: ${prefix}/@<author>/<name>`)
        }
    }

    if (tal) validateUrn(tal, 'tal')
    for (const dance of dances) validateUrn(dance, 'dance')
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
    localName?: string
    force?: boolean
    scope?: 'global' | 'stage'
}) {
    const targetCwd = resolveDotCwd(cwd, input.scope)
    await ensureDotDir(targetCwd)

    if (input.urn.startsWith('performer/')) {
        const result = await installPerformerAndLock(targetCwd, input.urn, input.localName, input.force)
        invalidate('assets')
        return { ...result, scope: input.scope || 'stage' }
    }

    if (input.urn.startsWith('act/')) {
        const result = await installActWithDependencies(targetCwd, input.urn, input.force)
        invalidate('assets')
        return { ...result, scope: input.scope || 'stage' }
    }

    const result = await installAsset(targetCwd, input.urn, input.force)
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
    const result = await startDotLogin()
    return { ok: true, ...result }
}

export async function logoutFromDot() {
    await clearDotAuthUser()
    return { ok: true }
}

export async function saveDotLocalAsset(cwd: string, input: {
    kind: StudioAssetKind
    slug: string
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
        payload: input.payload,
    })
    invalidate('assets')
    return { ok: true, ...saved }
}

export async function publishDotAsset(cwd: string, input: {
    kind: StudioAssetKind
    slug: string
    payload?: unknown
    tags?: string[]
}) {
    const auth = await readDotAuthUser()
    if (!auth) {
        const error = new Error('You are not logged in. Run `dot login` first.')
        ;(error as any).status = 401
        throw error
    }

    const result = await publishStudioAsset({
        cwd,
        kind: input.kind,
        slug: input.slug,
        payload: input.payload,
        tags: input.tags,
        auth,
    })
    invalidate('assets')
    return { ok: true, ...result }
}
