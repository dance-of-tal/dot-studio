import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const instanceDisposeMock = vi.fn().mockResolvedValue({})

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: { dispose: instanceDisposeMock },
    }),
}))

describe('ensureAssistantAgent', () => {
    let executionDir: string

    beforeEach(async () => {
        executionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-assistant-projection-'))
        instanceDisposeMock.mockClear()
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

        const { ensureAssistantAgent } = await import('./assistant-service.js')

        const agentName = await ensureAssistantAgent(executionDir)

        expect(agentName).toBe('dot-studio/studio-assistant')
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
        expect(prompt).toContain('Never use relation field aliases like fromPerformerRef or toPerformerRef')
        expect(prompt).toContain('d2c company team, investment team, review flow, or pipeline')
        expect(prompt).toContain('Every new relation must include a non-empty name and non-empty description')
        expect(prompt).toContain('When creating a Performer, reflect the user request in the Performer itself')
        expect(prompt).toContain('When creating or updating an Act, reflect the user request in the Act composition itself')
        expect(prompt).toContain('For asset creation requests involving Tal, Dance, Performer, or Act, it is good to use a short question-and-answer flow')
    })
})
