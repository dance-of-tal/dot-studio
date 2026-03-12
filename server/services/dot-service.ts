import fs from 'fs/promises'
import { ensureDotDir, getDotDir, getGlobalCwd, getGlobalDotDir, initRegistry } from 'dance-of-tal/lib/registry'
import { installActWithDependencies, installAsset, installPerformerAndLock } from 'dance-of-tal/lib/installer'
import { clearDotAuthUser, publishStudioAsset, readDotAuthUser, saveLocalStudioAsset, type StudioAssetKind } from '../lib/dot-authoring.js'
import { startDotLogin } from '../lib/dot-login.js'

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
        return { ...result, scope: input.scope || 'stage' }
    }

    if (input.urn.startsWith('act/')) {
        const result = await installActWithDependencies(targetCwd, input.urn, input.force)
        return { ...result, scope: input.scope || 'stage' }
    }

    const result = await installAsset(targetCwd, input.urn, input.force)
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
    return { ok: true, ...result }
}
