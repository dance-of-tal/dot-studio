import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const instanceDisposeMock = vi.fn().mockResolvedValue({})
const listStudioAssetsMock = vi.fn()
const searchDotRegistryMock = vi.fn()
const searchSkillsCatalogMock = vi.fn()
let managedOpencode = false
let studioDir = ''

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: { dispose: instanceDisposeMock },
    }),
}))

vi.mock('../../lib/opencode-sidecar.js', () => ({
    isManagedOpencode: () => managedOpencode,
}))

vi.mock('../../lib/config.js', () => ({
    get STUDIO_DIR() {
        return studioDir
    },
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
        studioDir = path.join(executionDir, '.studio-home')
        managedOpencode = false
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
        const projectedTool = await fs.readFile(path.join(
            executionDir,
            '.opencode',
            'tools',
            'apply_studio_actions.ts',
        ), 'utf-8')
        expect(projectedTool).toContain('Apply Studio workspace mutations')
        expect(projectedTool).toContain('lintAssistantActionEnvelope')
        expect(projectedTool).toContain('rejected the mutation envelope')
        expect(projectedTool).not.toContain('../../shared/assistant-action-protocol.js')
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

    it('removes duplicate assistant projection from ancestor directories', async () => {
        const ancestorDir = executionDir
        const childDir = path.join(executionDir, 'nested', 'workspace')

        await fs.mkdir(path.join(ancestorDir, '.opencode', 'tools'), { recursive: true })
        await fs.mkdir(path.join(ancestorDir, '.opencode', 'agents', 'dot-studio'), { recursive: true })
        await fs.mkdir(path.join(ancestorDir, '.opencode', 'skills', 'dot-studio', 'find-skills'), { recursive: true })
        await fs.writeFile(path.join(ancestorDir, '.opencode', 'tools', 'apply_studio_actions.ts'), 'legacy tool\n', 'utf-8')
        await fs.writeFile(path.join(ancestorDir, '.opencode', 'agents', 'dot-studio', 'studio-assistant.md'), 'legacy agent\n', 'utf-8')
        await fs.writeFile(path.join(ancestorDir, '.opencode', 'skills', 'dot-studio', 'find-skills', 'SKILL.md'), 'legacy skill\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')
        await ensureAssistantAgent(childDir)

        await expect(fs.stat(path.join(ancestorDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(ancestorDir, '.opencode', 'agents', 'dot-studio', 'studio-assistant.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(ancestorDir, '.opencode', 'skills', 'dot-studio', 'find-skills'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(childDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).resolves.toBeTruthy()
    })

    it('removes duplicate assistant projection from descendant directories', async () => {
        const parentDir = executionDir
        const childDir = path.join(executionDir, 'nested', 'workspace')

        await fs.mkdir(path.join(childDir, '.opencode', 'tools'), { recursive: true })
        await fs.mkdir(path.join(childDir, '.opencode', 'agents', 'dot-studio'), { recursive: true })
        await fs.mkdir(path.join(childDir, '.opencode', 'skills', 'dot-studio', 'find-skills'), { recursive: true })
        await fs.writeFile(path.join(childDir, '.opencode', 'tools', 'apply_studio_actions.ts'), 'legacy tool\n', 'utf-8')
        await fs.writeFile(path.join(childDir, '.opencode', 'agents', 'dot-studio', 'studio-assistant.md'), 'legacy agent\n', 'utf-8')
        await fs.writeFile(path.join(childDir, '.opencode', 'skills', 'dot-studio', 'find-skills', 'SKILL.md'), 'legacy skill\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')
        await ensureAssistantAgent(parentDir)

        await expect(fs.stat(path.join(childDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(childDir, '.opencode', 'agents', 'dot-studio', 'studio-assistant.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(childDir, '.opencode', 'skills', 'dot-studio', 'find-skills'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(parentDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).resolves.toBeTruthy()
    })

    it('projects assistant artifacts into the managed global sidecar config and prunes local duplicates', async () => {
        managedOpencode = true

        await fs.mkdir(path.join(executionDir, '.opencode', 'tools'), { recursive: true })
        await fs.mkdir(path.join(executionDir, '.opencode', 'agents', 'dot-studio'), { recursive: true })
        await fs.writeFile(path.join(executionDir, '.opencode', 'tools', 'apply_studio_actions.ts'), 'legacy local tool\n', 'utf-8')
        await fs.writeFile(path.join(executionDir, '.opencode', 'agents', 'dot-studio', 'studio-assistant.md'), 'legacy local agent\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')
        await ensureAssistantAgent(executionDir)

        await expect(fs.stat(path.join(executionDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(executionDir, '.opencode', 'agents', 'dot-studio', 'studio-assistant.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(studioDir, 'opencode', 'tools', 'apply_studio_actions.ts'))).resolves.toBeTruthy()
        await expect(fs.stat(path.join(studioDir, 'opencode', 'agents', 'dot-studio', 'studio-assistant.md'))).resolves.toBeTruthy()
        await expect(fs.stat(path.join(studioDir, 'opencode', 'skills', 'dot-studio', 'find-skills', 'SKILL.md'))).resolves.toBeTruthy()
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
        expect(prompt).toContain('do not ask a redundant confirmation question')
        expect(prompt).toContain('Load the smallest relevant guide before calling the tool')
        expect(prompt).toContain('studio-assistant-performer-guide')
        expect(prompt).toContain('studio-assistant-act-guide')
        expect(prompt).toContain('studio-assistant-workflow-guide')
        expect(prompt).toContain('one dependency-ordered tool call: create performers first, then createAct')
        expect(prompt).toContain('You can CRUD all four authoring asset families')
        expect(prompt).toContain('Tal and Dance are local draft create/update/delete only')
        expect(prompt).toContain('Performer and Act are current Stage create/update/delete only')
        expect(prompt).toContain('same-call refs as the main cascade mechanism')
        expect(prompt).toContain('When the user explicitly names the requested performers')
        expect(prompt).toContain('prefer adding at least one relation in createAct')
        expect(prompt).toContain('prefer participantPerformerRefs on createAct over follow-up attachPerformerToAct actions')
        expect(prompt).toContain('Do not emit fenced JSON')
        expect(prompt).toContain('One invalid action causes the tool call to fail')
        expect(prompt).toContain('Save Local and Publish are outside this assistant CRUD surface')
        expect(prompt).toContain('Treat install/import helpers as support paths, not as CRUD')
        expect(prompt).toContain('Legacy from... and to... relation aliases are invalid')
        expect(prompt).toContain('Every new relation must include a non-empty name and non-empty description')
        expect(prompt).toContain('When creating a Performer, reflect the user request in the Performer itself')
        expect(prompt).toContain('Performer description becomes participant focus in Act runtime')
        expect(prompt).toContain('When creating or updating an Act, reflect the user request in the Act composition itself')
        expect(prompt).toContain('Act safety threadTimeoutMs is a runtime deadline, not a participant wait_until wake')
        expect(prompt).toContain('Use the workspace snapshot as the source of truth')
        expect(prompt).toContain('Choose the lightest valid response mode')
        expect(prompt).toContain('Prefer reuse first, install/import second, and brand-new draft or Stage creation third')
        expect(prompt).toContain('Keep SKILL.md concise and procedural')
        expect(prompt).toContain('Do not create extra bundle docs like README.md')
        expect(prompt).toContain('load `find-skills` instead of defaulting to new Dance creation')
        expect(prompt).toContain('reviewed for source trust, install count, maintainer reputation')
        expect(prompt).toContain('call the mutation tool when the request is specific enough')
        expect(prompt).toContain('Do not paste raw mutation JSON into the reply')
        expect(prompt).toContain('Omit unspecified optional fields entirely')
        expect(prompt).toContain('Tool arguments must be a valid action envelope with version=1 and an actions array')
        expect(prompt).toContain('Missing Tal, Dance, or model details alone are not enough to block a direct team or workflow creation request')
        expect(prompt).toContain('you may still create role-appropriate Performers without Tal setup')
        expect(prompt).toContain('Canonical createAct tool args')
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
