// dot add service — installs Dance skills from a GitHub repo
import path from 'path'
import {
    parseSource,
    getOwnerRepo,
    shallowClone,
    ensureDotDir,
    getGlobalCwd,
    reportInstall,
} from '../lib/dot-source.js'
import { invalidate } from '../lib/cache.js'
import {
    buildGitHubDanceLockEntryInput,
    copyGitHubDanceSkill,
    discoverGitHubDanceSkills,
    getGitHubTreeSha,
    resolveGitHubRef,
    upsertGitHubDanceLockEntry,
} from './dance-github-source.js'

const REGISTRY_URL = process.env.DOT_REGISTRY_URL || 'https://registry.dance-of-tal.workers.dev'

export interface AddResult {
    installed: Array<{ urn: string; name: string; description: string }>
    source: string
}

async function autoRegisterInRegistry(
    urn: string,
    skill: { name: string; description: string; tags: string[]; repoRootSkillPath: string },
    sourceUrl: string,
    ref?: string,
): Promise<void> {
    const ownerRepo = getOwnerRepo(sourceUrl)

    try {
        const response = await fetch(`${REGISTRY_URL}/assets/dance`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                urn,
                name: skill.name,
                description: skill.description,
                tags: skill.tags,
                resource: {
                    type: 'github',
                    repo: ownerRepo,
                    path: skill.repoRootSkillPath,
                    ref: ref || 'main',
                },
            }),
        })

        if (!response.ok) {
            return
        }
    } catch {
        // Best-effort only: install should still succeed without registry registration.
    }
}

export async function addDanceFromGitHub(cwd: string, source: string, scope?: 'global' | 'stage'): Promise<AddResult> {
    const parsed = parseSource(source)
    const resolvedRef = await resolveGitHubRef(parsed.owner, parsed.repo, parsed.ref)

    const { tempDir, cleanup } = await shallowClone({ url: parsed.url, ref: resolvedRef !== 'HEAD' ? resolvedRef : undefined })

    try {
        let skills = await discoverGitHubDanceSkills(tempDir, parsed)

        // Apply skill filter from @skill shorthand
        if (parsed.skillFilter) {
            skills = skills.filter((s) => s.skill.name === parsed.skillFilter)
            if (skills.length === 0) {
                throw new Error(`Skill '${parsed.skillFilter}' not found in ${parsed.url}`)
            }
        }

        if (skills.length === 0) {
            throw new Error(`No SKILL.md files found in ${source}`)
        }

        // Install each skill — use global cwd when scope is 'global'
        const targetCwd = scope === 'global' ? getGlobalCwd() : cwd
        const owner = parsed.owner
        const stage = parsed.repo
        const installed: AddResult['installed'] = []

        await ensureDotDir(targetCwd)

        for (const skill of skills) {
            const urn = `dance/@${owner}/${stage}/${skill.skill.name}`
            const srcDir = path.dirname(skill.skill.skillMdPath)
            const remoteHash = await getGitHubTreeSha(
                parsed.owner,
                parsed.repo,
                resolvedRef,
                skill.repoRootSkillPath,
            )

            await copyGitHubDanceSkill(targetCwd, urn, srcDir, { repoRoot: tempDir })
            await upsertGitHubDanceLockEntry(
                targetCwd,
                urn,
                buildGitHubDanceLockEntryInput(
                    parsed,
                    resolvedRef,
                    skill.repoRootSkillPath,
                    remoteHash.status === 'ok' ? remoteHash.hash : undefined,
                ),
            )

            await autoRegisterInRegistry(urn, {
                name: skill.skill.name,
                description: skill.skill.description,
                tags: skill.skill.tags,
                repoRootSkillPath: skill.repoRootSkillPath,
            }, parsed.url, resolvedRef)
            reportInstall(urn).catch(() => {})

            installed.push({ urn, name: skill.skill.name, description: skill.skill.description })
        }

        invalidate('assets')
        return { installed, source: parsed.url }
    } finally {
        await cleanup()
    }
}
