import { beforeEach, describe, expect, it, vi } from 'vitest'

const getGlobalCwdMock = vi.hoisted(() => vi.fn(() => '/tmp/global-dot'))
const parseSourceMock = vi.hoisted(() => vi.fn((sourceUrl: string) => {
    const [, owner = 'acme', repo = 'skill-pack'] = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)/) || []
    return {
        type: 'github',
        owner,
        repo,
        url: `${sourceUrl.replace(/\/+$/, '').replace(/\.git$/, '')}.git`,
    }
}))

const invalidateMock = vi.hoisted(() => vi.fn())

const readGitHubDanceSourceMapMock = vi.hoisted(() => vi.fn())
const getGitHubTreeShaMock = vi.hoisted(() => vi.fn())
const readNormalizedGitHubDanceLockEntriesMock = vi.hoisted(() => vi.fn())
const cloneGitHubDanceSourceMock = vi.hoisted(() => vi.fn())
const discoverGitHubDanceSkillsMock = vi.hoisted(() => vi.fn())
const copyGitHubDanceSkillMock = vi.hoisted(() => vi.fn())
const upsertGitHubDanceLockEntryMock = vi.hoisted(() => vi.fn())
const resolveGitHubRefMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/dot-source.js', () => ({
    getGlobalCwd: getGlobalCwdMock,
    parseSource: parseSourceMock,
}))

vi.mock('../lib/cache.js', () => ({
    invalidate: invalidateMock,
}))

vi.mock('./dance-github-source.js', () => ({
    readGitHubDanceSourceMap: readGitHubDanceSourceMapMock,
    getGitHubTreeSha: getGitHubTreeShaMock,
    readNormalizedGitHubDanceLockEntries: readNormalizedGitHubDanceLockEntriesMock,
    cloneGitHubDanceSource: cloneGitHubDanceSourceMock,
    discoverGitHubDanceSkills: discoverGitHubDanceSkillsMock,
    copyGitHubDanceSkill: copyGitHubDanceSkillMock,
    upsertGitHubDanceLockEntry: upsertGitHubDanceLockEntryMock,
    resolveGitHubRef: resolveGitHubRefMock,
    buildGitHubDanceLockEntryInput: vi.fn((parsed, resolvedRef, repoRootSkillPath, skillFolderHash) => ({
        source: 'github',
        sourceUrl: parsed.url.replace(/\.git$/, ''),
        owner: parsed.owner,
        repo: parsed.repo,
        ref: resolvedRef,
        repoRootSkillPath,
        skillPath: repoRootSkillPath,
        ...(skillFolderHash ? { skillFolderHash } : {}),
    })),
    normalizeGitHubDanceLockEntry: vi.fn((value) => value),
}))

const SOURCE = {
    source: 'github' as const,
    sourceUrl: 'https://github.com/acme/skill-pack',
    owner: 'acme',
    repo: 'skill-pack',
    ref: 'main',
    repoRootSkillPath: 'skills/research-pack',
    skillFolderHash: 'local-hash',
    legacy: false,
    verifiable: true,
}

describe('dance GitHub update service', () => {
    beforeEach(() => {
        readGitHubDanceSourceMapMock.mockReset()
        getGitHubTreeShaMock.mockReset()
        readNormalizedGitHubDanceLockEntriesMock.mockReset()
        cloneGitHubDanceSourceMock.mockReset()
        discoverGitHubDanceSkillsMock.mockReset()
        copyGitHubDanceSkillMock.mockReset()
        upsertGitHubDanceLockEntryMock.mockReset()
        resolveGitHubRefMock.mockReset()
        invalidateMock.mockReset()
    })

    it('reports repo drift when the source repo now exposes additional skills', async () => {
        readGitHubDanceSourceMapMock.mockResolvedValue(new Map([
            ['dance/@acme/skill-pack/research-pack', SOURCE],
        ]))
        readNormalizedGitHubDanceLockEntriesMock.mockResolvedValue([
            { urn: 'dance/@acme/skill-pack/research-pack', entry: SOURCE },
        ])
        getGitHubTreeShaMock.mockResolvedValue({ status: 'ok', hash: 'local-hash' })
        cloneGitHubDanceSourceMock.mockResolvedValue({
            tempDir: '/tmp/clone',
            cleanup: vi.fn(),
        })
        discoverGitHubDanceSkillsMock.mockResolvedValue([
            {
                repoRootSkillPath: 'skills/research-pack',
                skill: { name: 'research-pack', description: 'Research helpers', skillMdPath: '/tmp/clone/skills/research-pack/SKILL.md' },
            },
            {
                repoRootSkillPath: 'skills/interview-pack',
                skill: { name: 'interview-pack', description: 'Interview helpers', skillMdPath: '/tmp/clone/skills/interview-pack/SKILL.md' },
            },
        ])

        const { checkDanceGitHubUpdates } = await import('./dance-github-update-service.js')
        const result = await checkDanceGitHubUpdates('/tmp/workspace', [{
            urn: 'dance/@acme/skill-pack/research-pack',
            scope: 'stage',
        }], true)

        expect(result[0]?.sync.state).toBe('repo_drift')
        expect(result[0]?.sync.repoDrift?.newSkills).toEqual([
            expect.objectContaining({
                name: 'interview-pack',
                urn: 'dance/@acme/skill-pack/interview-pack',
            }),
        ])
    })

    it('updates installed GitHub dance bundles in place and invalidates asset caches', async () => {
        let cleaned = false
        readGitHubDanceSourceMapMock.mockResolvedValue(new Map([
            ['dance/@acme/skill-pack/research-pack', SOURCE],
        ]))
        readNormalizedGitHubDanceLockEntriesMock.mockResolvedValue([
            { urn: 'dance/@acme/skill-pack/research-pack', entry: SOURCE },
        ])
        cloneGitHubDanceSourceMock.mockResolvedValue({
            tempDir: '/tmp/clone',
            cleanup: vi.fn(async () => {
                cleaned = true
            }),
        })
        discoverGitHubDanceSkillsMock.mockResolvedValue([
            {
                repoRootSkillPath: 'skills/research-pack',
                skill: { name: 'research-pack', description: 'Research helpers', skillMdPath: '/tmp/clone/skills/research-pack/SKILL.md' },
            },
        ])
        getGitHubTreeShaMock.mockResolvedValue({ status: 'ok', hash: 'remote-hash' })
        copyGitHubDanceSkillMock.mockImplementation(async () => {
            expect(cleaned).toBe(false)
        })

        const { applyDanceGitHubUpdates } = await import('./dance-github-update-service.js')
        const result = await applyDanceGitHubUpdates('/tmp/workspace', [{
            urn: 'dance/@acme/skill-pack/research-pack',
            scope: 'stage',
        }])

        expect(copyGitHubDanceSkillMock).toHaveBeenCalledWith(
            '/tmp/workspace',
            'dance/@acme/skill-pack/research-pack',
            '/tmp/clone/skills/research-pack',
            { repoRoot: '/tmp/clone' },
        )
        expect(upsertGitHubDanceLockEntryMock).toHaveBeenCalledWith(
            '/tmp/workspace',
            'dance/@acme/skill-pack/research-pack',
            expect.objectContaining({
                ref: 'main',
                repoRootSkillPath: 'skills/research-pack',
                skillFolderHash: 'remote-hash',
            }),
        )
        expect(result.updated[0]?.sync.state).toBe('up_to_date')
        expect(invalidateMock).toHaveBeenCalledWith('assets')
        expect(cleaned).toBe(true)
    })

    it('reimports only newly available skills from the same GitHub source group', async () => {
        readGitHubDanceSourceMapMock.mockResolvedValue(new Map([
            ['dance/@acme/skill-pack/research-pack', SOURCE],
        ]))
        readNormalizedGitHubDanceLockEntriesMock.mockResolvedValue([
            { urn: 'dance/@acme/skill-pack/research-pack', entry: SOURCE },
        ])
        cloneGitHubDanceSourceMock.mockResolvedValue({
            tempDir: '/tmp/clone',
            cleanup: vi.fn(),
        })
        discoverGitHubDanceSkillsMock.mockResolvedValue([
            {
                repoRootSkillPath: 'skills/research-pack',
                skill: { name: 'research-pack', description: 'Research helpers', skillMdPath: '/tmp/clone/skills/research-pack/SKILL.md' },
            },
            {
                repoRootSkillPath: 'skills/interview-pack',
                skill: { name: 'interview-pack', description: 'Interview helpers', skillMdPath: '/tmp/clone/skills/interview-pack/SKILL.md' },
            },
        ])
        resolveGitHubRefMock.mockResolvedValue('main')
        getGitHubTreeShaMock.mockResolvedValue({ status: 'ok', hash: 'remote-hash' })

        const { reimportDanceGitHubSource } = await import('./dance-github-update-service.js')
        const result = await reimportDanceGitHubSource('/tmp/workspace', {
            urn: 'dance/@acme/skill-pack/research-pack',
            scope: 'stage',
        })

        expect(result.installed).toEqual([{
            urn: 'dance/@acme/skill-pack/interview-pack',
            name: 'interview-pack',
            description: 'Interview helpers',
        }])
        expect(result.skippedExistingUrns).toEqual([
            'dance/@acme/skill-pack/research-pack',
        ])
    })
})
