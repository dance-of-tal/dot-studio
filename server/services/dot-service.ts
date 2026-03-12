import fs from 'fs/promises'
import { ensureDotDir, getDotDir, getGlobalCwd, getGlobalDotDir, initRegistry } from 'dance-of-tal/lib/registry'
import { installActWithDependencies, installAsset, installPerformerAndLock } from 'dance-of-tal/lib/installer'

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
