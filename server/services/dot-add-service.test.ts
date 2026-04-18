import { beforeEach, describe, expect, it, vi } from 'vitest'

const parseSourceMock = vi.hoisted(() => vi.fn())
const shallowCloneMock = vi.hoisted(() => vi.fn())
const ensureDotDirMock = vi.hoisted(() => vi.fn())
const getGlobalCwdMock = vi.hoisted(() => vi.fn(() => '/tmp/global-dot'))
const reportInstallMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const getOwnerRepoMock = vi.hoisted(() => vi.fn(() => 'acme/skill-pack'))

const discoverGitHubDanceSkillsMock = vi.hoisted(() => vi.fn())
const resolveGitHubRefMock = vi.hoisted(() => vi.fn())
const getGitHubTreeShaMock = vi.hoisted(() => vi.fn())
const copyGitHubDanceSkillMock = vi.hoisted(() => vi.fn())
const upsertGitHubDanceLockEntryMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/dot-source.js', () => ({
    parseSource: parseSourceMock,
    shallowClone: shallowCloneMock,
    ensureDotDir: ensureDotDirMock,
    getGlobalCwd: getGlobalCwdMock,
    reportInstall: reportInstallMock,
    getOwnerRepo: getOwnerRepoMock,
}))

vi.mock('./dance-github-source.js', () => ({
    discoverGitHubDanceSkills: discoverGitHubDanceSkillsMock,
    resolveGitHubRef: resolveGitHubRefMock,
    getGitHubTreeSha: getGitHubTreeShaMock,
    copyGitHubDanceSkill: copyGitHubDanceSkillMock,
    upsertGitHubDanceLockEntry: upsertGitHubDanceLockEntryMock,
    buildGitHubDanceLockEntryInput: vi.fn((parsed, resolvedRef, repoRootSkillPath, skillFolderHash) => ({
        source: 'github',
        sourceUrl: parsed.url.replace(/\.git$/, ''),
        skillPath: repoRootSkillPath,
        owner: parsed.owner,
        repo: parsed.repo,
        ref: resolvedRef,
        ...(parsed.subpath ? { sourceSubpath: parsed.subpath } : {}),
        repoRootSkillPath,
        ...(skillFolderHash ? { skillFolderHash } : {}),
    })),
}))

vi.mock('../lib/cache.js', () => ({
    invalidate: vi.fn(),
}))

describe('addDanceFromGitHub', () => {
    beforeEach(() => {
        parseSourceMock.mockReset()
        shallowCloneMock.mockReset()
        ensureDotDirMock.mockReset()
        reportInstallMock.mockReset()
        discoverGitHubDanceSkillsMock.mockReset()
        resolveGitHubRefMock.mockReset()
        getGitHubTreeShaMock.mockReset()
        copyGitHubDanceSkillMock.mockReset()
        upsertGitHubDanceLockEntryMock.mockReset()
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    })

    it('persists normalized GitHub provenance metadata for new installs', async () => {
        parseSourceMock.mockReturnValue({
            type: 'github',
            owner: 'acme',
            repo: 'skill-pack',
            url: 'https://github.com/acme/skill-pack.git',
            subpath: 'skills',
        })
        resolveGitHubRefMock.mockResolvedValue('main')
        shallowCloneMock.mockResolvedValue({
            tempDir: '/tmp/clone',
            cleanup: vi.fn(),
        })
        discoverGitHubDanceSkillsMock.mockResolvedValue([
            {
                repoRootSkillPath: 'skills/research-pack',
                skill: {
                    name: 'research-pack',
                    description: 'Research helpers',
                    tags: ['research'],
                    skillMdPath: '/tmp/clone/skills/research-pack/SKILL.md',
                },
            },
        ])
        getGitHubTreeShaMock.mockResolvedValue({ status: 'ok', hash: 'remote-hash' })

        const { addDanceFromGitHub } = await import('./dot-add-service.js')
        const result = await addDanceFromGitHub('/tmp/workspace', 'acme/skill-pack/skills', 'stage')

        expect(result.installed).toEqual([{
            urn: 'dance/@acme/skill-pack/research-pack',
            name: 'research-pack',
            description: 'Research helpers',
        }])
        expect(copyGitHubDanceSkillMock).toHaveBeenCalledWith(
            '/tmp/workspace',
            'dance/@acme/skill-pack/research-pack',
            '/tmp/clone/skills/research-pack',
        )
        expect(upsertGitHubDanceLockEntryMock).toHaveBeenCalledWith(
            '/tmp/workspace',
            'dance/@acme/skill-pack/research-pack',
            expect.objectContaining({
                sourceUrl: 'https://github.com/acme/skill-pack',
                owner: 'acme',
                repo: 'skill-pack',
                ref: 'main',
                sourceSubpath: 'skills',
                repoRootSkillPath: 'skills/research-pack',
                skillFolderHash: 'remote-hash',
            }),
        )
    })
})
