import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const instanceDisposeMock = vi.fn().mockResolvedValue({})
const listStudioAssetsMock = vi.fn()
const searchDotRegistryMock = vi.fn()
const searchSkillsCatalogMock = vi.fn()

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: { dispose: instanceDisposeMock },
    }),
}))

vi.mock('../asset-service.js', () => ({
    listStudioAssets: listStudioAssetsMock,
}))

vi.mock('../dot-service.js', () => ({
    searchDotRegistry: searchDotRegistryMock,
    searchSkillsCatalog: searchSkillsCatalogMock,
}))

describe('ensureAssistantAgent', () => {
    let executionDir: string

    beforeEach(async () => {
        executionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-assistant-projection-'))
        instanceDisposeMock.mockClear()
        listStudioAssetsMock.mockReset().mockResolvedValue([])
        searchDotRegistryMock.mockReset().mockResolvedValue([])
        searchSkillsCatalogMock.mockReset().mockResolvedValue([])
    })

    afterEach(async () => {
        await fs.rm(executionDir, { recursive: true, force: true }).catch(() => {})
    })

    it('projects builtin skill sibling files and prunes stale siblings', async () => {
        const staleFile = path.join(
            executionDir,
            '.opencode',
            'skills',
            'dot-studio',
            'studio-assistant-skill-creator-guide',
            'references',
            'stale.md',
        )
        await fs.mkdir(path.dirname(staleFile), { recursive: true })
        await fs.writeFile(staleFile, 'stale\n', 'utf-8')
        const staleSkillDir = path.join(
            executionDir,
            '.opencode',
            'skills',
            'dot-studio',
            'legacy-flat-skill',
        )
        await fs.mkdir(staleSkillDir, { recursive: true })
        await fs.writeFile(path.join(staleSkillDir, 'SKILL.md'), '# legacy\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')

        const agentName = await ensureAssistantAgent(executionDir)

        expect(agentName).toBe('dot-studio/studio-assistant')
        await expect(fs.readFile(path.join(
            executionDir,
            '.opencode',
            'skills',
            'dot-studio',
            'find-skills',
            'SKILL.md',
        ), 'utf-8')).resolves.toContain('Find Skills')
        await expect(fs.readFile(path.join(
            executionDir,
            '.opencode',
            'skills',
            'dot-studio',
            'studio-assistant-skill-creator-guide',
            'references',
            'bundle-authoring.md',
        ), 'utf-8')).resolves.toContain('SKILL.md')
        await expect(fs.stat(staleFile)).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(staleSkillDir)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(instanceDisposeMock).toHaveBeenCalledWith({ directory: executionDir })
    })

    it('tells the assistant to avoid invented ids and string actRules payloads', async () => {
        const { buildAssistantActionPrompt } = await import('./assistant-service.js')

        const prompt = buildAssistantActionPrompt({
            workingDir: '/tmp/workspace',
            performers: [],
            acts: [],
            drafts: [],
            availableModels: [],
        })

        expect(prompt).toContain('Do not stop after creating loose performers')
        expect(prompt).toContain('Prefer explicit ids from the snapshot')
        expect(prompt).toContain('ref on the create action')
        expect(prompt).toContain('Actions are applied sequentially in array order')
        expect(prompt).toContain('You can CRUD all four authoring asset families')
        expect(prompt).toContain('Tal and Dance are local draft create/update/delete only')
        expect(prompt).toContain('Performer and Act are current Stage create/update/delete only')
        expect(prompt).toContain('same-block refs as the main cascade mechanism')
        expect(prompt).toContain('creating all missing performers first, then createAct with participantPerformerRefs')
        expect(prompt).toContain('prefer adding at least one relation in createAct')
        expect(prompt).toContain('Do not emit fenced JSON')
        expect(prompt).toContain('One invalid action can cause the whole block to be ignored')
        expect(prompt).toContain('Save Local and Publish are outside this assistant CRUD surface')
        expect(prompt).toContain('Treat install/import helpers as support paths, not as CRUD')
        expect(prompt).toContain('Legacy from... and to... relation aliases are invalid')
        expect(prompt).toContain('d2c company team, investment team, review flow, or pipeline')
        expect(prompt).toContain('Every new relation must include a non-empty name and non-empty description')
        expect(prompt).toContain('When creating a Performer, reflect the user request in the Performer itself')
        expect(prompt).toContain('Performer description becomes participant focus in Act runtime')
        expect(prompt).toContain('When creating or updating an Act, reflect the user request in the Act composition itself')
        expect(prompt).toContain('Act safety threadTimeoutMs is a runtime deadline, not a participant wait_until wake')
        expect(prompt).toContain('For asset creation requests involving Tal, Dance, Performer, or Act, it is good to use a short question-and-answer flow')
        expect(prompt).toContain('Use the workspace snapshot as the source of truth')
        expect(prompt).toContain('Choose the lightest valid response mode')
        expect(prompt).toContain('Prefer reuse first, install/import second, and brand-new draft or Stage creation third')
        expect(prompt).toContain('keep SKILL.md concise and procedural')
        expect(prompt).toContain('Do not create extra bundle docs like README.md')
        expect(prompt).toContain('load find-skills instead of defaulting to new Dance creation')
        expect(prompt).toContain('reviewed for source trust, install count, maintainer reputation')
        expect(prompt).toContain('attach it via addDanceUrns in the same action block')
    })

    it('adds skill intent and security hints for find/apply requests', async () => {
        searchSkillsCatalogMock.mockResolvedValue([
            {
                urn: 'dance/@vercel-labs/skills/find-skills',
                kind: 'dance',
                name: 'find-skills',
                owner: 'vercel-labs/skills',
                description: '731.2K installs · from vercel-labs/skills',
                tags: ['skills.sh'],
                installs: 731153,
            },
        ])

        const { buildAssistantDiscoveryPrompt } = await import('./assistant-service.js')

        const prompt = await buildAssistantDiscoveryPrompt(executionDir, 'find a skill and apply it to my researcher performer')

        expect(prompt).toContain('Skill Intent Hint:')
        expect(prompt).toContain('Load and use `find-skills`.')
        expect(prompt).toContain('warn the user briefly to review the source repo')
        expect(prompt).toContain('skills.sh dance matches:')
        expect(prompt).toContain('find-skills (dance/@vercel-labs/skills/find-skills)')
        expect(prompt).toContain('If you recommend or apply one of these, include a short security warning')
    })

    it('steers create requests toward local Dance authoring instead of external search', async () => {
        const { buildAssistantDiscoveryPrompt } = await import('./assistant-service.js')

        const prompt = await buildAssistantDiscoveryPrompt(executionDir, 'create a new dance skill for release notes')

        expect(prompt).toContain('The user likely wants to create or improve a local Dance skill bundle.')
        expect(prompt).toContain('Load and use `studio-assistant-skill-creator-guide`.')
        expect(prompt).not.toContain('skills.sh dance matches:')
    })
})
