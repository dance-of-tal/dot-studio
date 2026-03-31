// dot add service — installs Dance skills from a GitHub repo
import path from 'path'
import {
    parseSource,
    getOwnerRepo,
    shallowClone,
    discoverSkills,
    copySkillDir,
    upsertSkillLockEntry,
    readPluginManifest,
    ensureDotDir,
    danceAssetDir,
    getGlobalCwd,
    reportInstall,
} from '../lib/dot-source.js'
import { invalidate } from '../lib/cache.js'
import type { DiscoveredSkill } from '../lib/dot-source.js'

const REGISTRY_URL = process.env.DOT_REGISTRY_URL || 'https://registry.dance-of-tal.workers.dev'

export interface AddResult {
    installed: Array<{ urn: string; name: string; description: string }>
    source: string
}

async function autoRegisterInRegistry(
    urn: string,
    skill: DiscoveredSkill,
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
                    path: skill.relativePath,
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

    const { tempDir, cleanup } = await shallowClone({ url: parsed.url, ref: parsed.ref })

    try {
        const searchDir = parsed.subpath ? path.join(tempDir, parsed.subpath) : tempDir
        let skills = await discoverSkills(searchDir)

        // Check plugin manifest for additional skill paths
        const manifest = await readPluginManifest(tempDir)
        if (manifest && manifest.skills.length > 0) {
            const existingNames = new Set(skills.map((s: DiscoveredSkill) => s.name))
            for (const entry of manifest.skills) {
                if (existingNames.has(entry.name)) continue
                const skillDir = path.join(tempDir, entry.path)
                const discovered = await discoverSkills(skillDir)
                skills.push(...discovered.filter((s: DiscoveredSkill) => !existingNames.has(s.name)))
            }
        }

        // Apply skill filter from @skill shorthand
        if (parsed.skillFilter) {
            skills = skills.filter((s: DiscoveredSkill) => s.name === parsed.skillFilter)
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
            const urn = `dance/@${owner}/${stage}/${skill.name}`
            const destDir = danceAssetDir(targetCwd, urn)
            const srcDir = path.dirname(skill.skillMdPath)

            copySkillDir(srcDir, destDir)

            await upsertSkillLockEntry(targetCwd, urn, {
                source: 'github',
                sourceUrl: parsed.url.replace(/\.git$/, ''),
                skillPath: skill.relativePath,
            })

            await autoRegisterInRegistry(urn, skill, parsed.url, parsed.ref)
            reportInstall(urn).catch(() => {})

            installed.push({ urn, name: skill.name, description: skill.description })
        }

        invalidate('assets')
        return { installed, source: parsed.url }
    } finally {
        await cleanup()
    }
}
