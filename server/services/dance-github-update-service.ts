import path from 'path'
import type { GitHubDanceRepoDrift, GitHubDanceSyncStatus } from '../../shared/asset-contracts.js'
import type {
    DotDanceReimportSourceResponse,
    InstalledDanceLocator,
} from '../../shared/dot-contracts.js'
import { getGlobalCwd, parseSource } from '../lib/dot-source.js'
import { invalidate } from '../lib/cache.js'
import {
    buildGitHubDanceLockEntryInput,
    cloneGitHubDanceSource,
    copyGitHubDanceSkill,
    discoverGitHubDanceSkills,
    getGitHubTreeSha,
    normalizeGitHubDanceLockEntry,
    readGitHubDanceSourceMap,
    readNormalizedGitHubDanceLockEntries,
    resolveGitHubRef,
    upsertGitHubDanceLockEntry,
    type DiscoveredGitHubDanceSkill,
    type NormalizedGitHubDanceLockEntry,
} from './dance-github-source.js'

type ScopeContext = {
    scope: 'global' | 'stage'
    cwd: string
}

type TargetDance = ScopeContext & {
    urn: string
    source: NormalizedGitHubDanceLockEntry | null
}

type SourceGroupSnapshot = {
    entries: Array<{ urn: string; entry: NormalizedGitHubDanceLockEntry }>
    discoveredByPath: Map<string, DiscoveredGitHubDanceSkill>
    repoDrift: GitHubDanceRepoDrift
}

function scopeCwd(cwd: string, scope: 'global' | 'stage') {
    return scope === 'global' ? getGlobalCwd() : cwd
}

function sourceGroupKey(entry: Pick<NormalizedGitHubDanceLockEntry, 'sourceUrl' | 'ref' | 'sourceSubpath'>) {
    return [entry.sourceUrl, entry.ref, entry.sourceSubpath || ''].join('::')
}

function buildSyncStatus(state: GitHubDanceSyncStatus['state'], patch?: Partial<GitHubDanceSyncStatus>): GitHubDanceSyncStatus {
    return {
        state,
        checkedAt: new Date().toISOString(),
        ...patch,
    }
}

function parsedSourceFromEntry(entry: NormalizedGitHubDanceLockEntry) {
    const parsed = parseSource(entry.sourceUrl)
    return {
        ...parsed,
        ref: entry.ref !== 'HEAD' ? entry.ref : undefined,
        subpath: entry.sourceSubpath,
    }
}

async function resolveTargets(cwd: string, assets: InstalledDanceLocator[]) {
    const stageMap = new Map<string, Awaited<ReturnType<typeof readGitHubDanceSourceMap>>>()
    const targets: TargetDance[] = []

    for (const asset of assets) {
        const assetCwd = scopeCwd(cwd, asset.scope)
        if (!stageMap.has(assetCwd)) {
            stageMap.set(assetCwd, await readGitHubDanceSourceMap(assetCwd))
        }
        const source = stageMap.get(assetCwd)?.get(asset.urn) || null
        targets.push({
            urn: asset.urn,
            scope: asset.scope,
            cwd: assetCwd,
            source: source?.verifiable && source.owner && source.repo && source.ref && source.repoRootSkillPath
                ? source as NormalizedGitHubDanceLockEntry
                : null,
        })
    }

    return targets
}

async function getSourceGroupSnapshot(
    target: TargetDance,
    cache: Map<string, Promise<SourceGroupSnapshot>>,
) {
    if (!target.source) {
        throw new Error(`GitHub provenance is missing for ${target.urn}.`)
    }

    const key = `${target.cwd}::${sourceGroupKey(target.source)}`
    const existing = cache.get(key)
    if (existing) {
        return existing
    }

    const task = (async (): Promise<SourceGroupSnapshot> => {
        const allEntries = await readNormalizedGitHubDanceLockEntries(target.cwd)
        const groupEntries = allEntries.filter(({ entry }) => sourceGroupKey(entry) === sourceGroupKey(target.source!))
        const { tempDir, cleanup } = await cloneGitHubDanceSource(target.source!.sourceUrl, target.source!.ref)

        try {
            const discovered = await discoverGitHubDanceSkills(tempDir, {
                subpath: target.source!.sourceSubpath,
            })
            const discoveredByPath = new Map(discovered.map((item) => [item.repoRootSkillPath, item]))
            const installedPaths = new Set(groupEntries.map(({ entry }) => entry.repoRootSkillPath))

            const newSkills = discovered
                .filter((item) => !installedPaths.has(item.repoRootSkillPath))
                .map((item) => ({
                    name: item.skill.name,
                    urn: `dance/@${target.source!.owner}/${target.source!.repo}/${item.skill.name}`,
                    repoRootSkillPath: item.repoRootSkillPath,
                }))

            const missingInstalledUrns = groupEntries
                .filter(({ entry }) => !discoveredByPath.has(entry.repoRootSkillPath))
                .map(({ urn }) => urn)

            return {
                entries: groupEntries,
                discoveredByPath,
                repoDrift: {
                    newSkills,
                    missingInstalledUrns,
                },
            }
        } finally {
            await cleanup()
        }
    })()

    cache.set(key, task)
    return task
}

function resolveLegacyStatus(source: ReturnType<typeof normalizeGitHubDanceLockEntry> | null) {
    if (!source) {
        return buildSyncStatus('check_failed', {
            canUpdate: false,
            message: 'GitHub provenance metadata is missing for this installed Dance.',
        })
    }

    if (!source.verifiable || !source.owner || !source.repo || !source.repoRootSkillPath) {
        return buildSyncStatus('legacy_unverifiable', {
            canUpdate: false,
            message: 'Studio could not reconstruct a trustworthy GitHub source path for this Dance.',
        })
    }

    if (!source.skillFolderHash) {
        return buildSyncStatus('legacy_unverifiable', {
            canUpdate: false,
            message: 'This Dance was installed before Studio tracked a baseline GitHub hash. Re-import it to relink updates.',
        })
    }

    return null
}

export async function checkDanceGitHubUpdates(
    cwd: string,
    assets: InstalledDanceLocator[],
    includeRepoDrift = false,
) {
    const targets = await resolveTargets(cwd, assets)
    const repoCache = new Map<string, Promise<SourceGroupSnapshot>>()

    return Promise.all(targets.map(async (target) => {
        const rawSourceMap = await readGitHubDanceSourceMap(target.cwd)
        const rawSource = rawSourceMap.get(target.urn) || null
        const legacyStatus = resolveLegacyStatus(rawSource)
        if (legacyStatus) {
            return {
                urn: target.urn,
                scope: target.scope,
                sync: legacyStatus,
            }
        }
        if (!target.source) {
            return {
                urn: target.urn,
                scope: target.scope,
                sync: buildSyncStatus('check_failed', {
                    canUpdate: false,
                    message: 'GitHub provenance metadata is unavailable.',
                }),
            }
        }

        const remote = await getGitHubTreeSha(
            target.source.owner,
            target.source.repo,
            target.source.ref,
            target.source.repoRootSkillPath,
        )

        if (remote.status === 'missing') {
            return {
                urn: target.urn,
                scope: target.scope,
                sync: buildSyncStatus('upstream_missing', {
                    canUpdate: false,
                    currentHash: target.source.skillFolderHash,
                    message: 'The upstream skill path no longer exists on GitHub. Your local copy is still installed.',
                }),
            }
        }

        if (remote.status === 'error') {
            return {
                urn: target.urn,
                scope: target.scope,
                sync: buildSyncStatus('check_failed', {
                    canUpdate: false,
                    currentHash: target.source.skillFolderHash,
                    message: remote.message,
                }),
            }
        }

        let repoDrift: GitHubDanceRepoDrift | undefined
        if (includeRepoDrift) {
            const snapshot = await getSourceGroupSnapshot(target, repoCache)
            if (snapshot.repoDrift.newSkills.length > 0 || snapshot.repoDrift.missingInstalledUrns.length > 0) {
                repoDrift = snapshot.repoDrift
            }
        }

        if (repoDrift) {
            return {
                urn: target.urn,
                scope: target.scope,
                sync: buildSyncStatus('repo_drift', {
                    canUpdate: true,
                    currentHash: target.source.skillFolderHash,
                    remoteHash: remote.hash,
                    repoDrift,
                    message: 'The source repo now exposes a different set of Dance skills.',
                }),
            }
        }

        const hasUpdate = target.source.skillFolderHash !== remote.hash
        return {
            urn: target.urn,
            scope: target.scope,
            sync: buildSyncStatus(hasUpdate ? 'update_available' : 'up_to_date', {
                canUpdate: true,
                currentHash: target.source.skillFolderHash,
                remoteHash: remote.hash,
                message: hasUpdate ? 'GitHub has newer contents for this Dance.' : 'This Dance matches the current GitHub source.',
            }),
        }
    }))
}

export async function applyDanceGitHubUpdates(
    cwd: string,
    assets: InstalledDanceLocator[],
) {
    const targets = await resolveTargets(cwd, assets)
    const repoCache = new Map<string, Promise<SourceGroupSnapshot>>()
    const updated: Array<InstalledDanceLocator & { sync: GitHubDanceSyncStatus }> = []
    const skipped: Array<InstalledDanceLocator & { reason: string; sync?: GitHubDanceSyncStatus }> = []

    for (const target of targets) {
        const rawSourceMap = await readGitHubDanceSourceMap(target.cwd)
        const rawSource = rawSourceMap.get(target.urn) || null
        const legacyStatus = resolveLegacyStatus(rawSource)
        if (legacyStatus) {
            skipped.push({
                urn: target.urn,
                scope: target.scope,
                reason: legacyStatus.message || 'Legacy GitHub provenance is incomplete.',
                sync: legacyStatus,
            })
            continue
        }
        if (!target.source) {
            skipped.push({
                urn: target.urn,
                scope: target.scope,
                reason: 'GitHub provenance metadata is missing.',
            })
            continue
        }

        const snapshot = await getSourceGroupSnapshot(target, repoCache)
        const discovered = snapshot.discoveredByPath.get(target.source.repoRootSkillPath)
        if (!discovered) {
            const sync = buildSyncStatus('upstream_missing', {
                canUpdate: false,
                currentHash: target.source.skillFolderHash,
                message: 'The upstream skill path no longer exists on GitHub.',
            })
            skipped.push({
                urn: target.urn,
                scope: target.scope,
                reason: sync.message || 'Upstream skill is missing.',
                sync,
            })
            continue
        }

        await copyGitHubDanceSkill(
            target.cwd,
            target.urn,
            path.dirname(discovered.skill.skillMdPath),
        )

        const remote = await getGitHubTreeSha(
            target.source.owner,
            target.source.repo,
            target.source.ref,
            target.source.repoRootSkillPath,
        )

        const lockEntry = buildGitHubDanceLockEntryInput(
            parsedSourceFromEntry(target.source),
            target.source.ref,
            target.source.repoRootSkillPath,
            remote.status === 'ok' ? remote.hash : target.source.skillFolderHash,
        )
        await upsertGitHubDanceLockEntry(target.cwd, target.urn, lockEntry)

        updated.push({
            urn: target.urn,
            scope: target.scope,
            sync: buildSyncStatus(remote.status === 'ok' ? 'up_to_date' : 'check_failed', {
                canUpdate: true,
                currentHash: remote.status === 'ok' ? remote.hash : target.source.skillFolderHash,
                remoteHash: remote.status === 'ok' ? remote.hash : undefined,
                message: remote.status === 'ok'
                    ? 'Dance bundle updated from GitHub.'
                    : 'Dance bundle updated, but Studio could not refresh the GitHub hash.',
            }),
        })
    }

    if (updated.length > 0) {
        invalidate('assets')
    }

    return { updated, skipped }
}

export async function reimportDanceGitHubSource(
    cwd: string,
    asset: InstalledDanceLocator,
): Promise<DotDanceReimportSourceResponse> {
    const [target] = await resolveTargets(cwd, [asset])
    const rawSourceMap = await readGitHubDanceSourceMap(target.cwd)
    const rawSource = rawSourceMap.get(target.urn) || null
    const legacyStatus = resolveLegacyStatus(rawSource)
    if (legacyStatus || !target.source) {
        throw new Error(legacyStatus?.message || 'GitHub provenance metadata is missing.')
    }

    const snapshot = await getSourceGroupSnapshot(target, new Map())
    const installedPaths = new Set(snapshot.entries.map(({ entry }) => entry.repoRootSkillPath))
    const resolvedRef = await resolveGitHubRef(target.source.owner, target.source.repo, target.source.ref)

    const installed: DotDanceReimportSourceResponse['installed'] = []
    const skippedExistingUrns: string[] = []

    for (const discovered of snapshot.discoveredByPath.values()) {
        if (installedPaths.has(discovered.repoRootSkillPath)) {
            skippedExistingUrns.push(`dance/@${target.source.owner}/${target.source.repo}/${discovered.skill.name}`)
            continue
        }

        const urn = `dance/@${target.source.owner}/${target.source.repo}/${discovered.skill.name}`
        await copyGitHubDanceSkill(
            target.cwd,
            urn,
            path.dirname(discovered.skill.skillMdPath),
        )

        const remote = await getGitHubTreeSha(
            target.source.owner,
            target.source.repo,
            resolvedRef,
            discovered.repoRootSkillPath,
        )

        const lockEntry = buildGitHubDanceLockEntryInput(
            parsedSourceFromEntry(target.source),
            resolvedRef,
            discovered.repoRootSkillPath,
            remote.status === 'ok' ? remote.hash : undefined,
        )
        await upsertGitHubDanceLockEntry(target.cwd, urn, lockEntry)

        installed.push({
            urn,
            name: discovered.skill.name,
            description: discovered.skill.description,
        })
    }

    if (installed.length > 0) {
        invalidate('assets')
    }

    return {
        sourceUrl: target.source.sourceUrl,
        installed,
        skippedExistingUrns,
    }
}
