import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDanceFromSkillMd } from 'dance-of-tal/contracts'
import { createDraft } from './draft-service.js'
import { DANCE_EXPORT_EXISTS_PREFIX, exportDanceBundle } from './dance-export-service.js'

describe('dance export service', () => {
    let workingDir: string
    let exportRoot: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-dance-export-'))
        exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-dance-export-target-'))
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        await fs.rm(exportRoot, { recursive: true, force: true }).catch(() => {})
    })

    it('exports a spec-facing dance bundle without draft metadata', async () => {
        const draft = await createDraft(workingDir, {
            kind: 'dance',
            id: 'dance-draft-1',
            name: 'Draft Dance',
            description: 'Review code safely',
            content: [
                '---',
                'name: "old-name"',
                'description: "Old description"',
                'license: "MIT"',
                'compatibility: "No special requirements"',
                'metadata: {"author":"someone","version":"1.0"}',
                'allowed-tools: "bash,git"',
                '---',
                '',
                '# Workflow',
                '',
                'Review the pull request.',
            ].join('\n'),
        })

        await fs.mkdir(path.join(workingDir, '.dance-of-tal', 'drafts', 'dance', draft.id, 'scripts'), { recursive: true })
        await fs.writeFile(path.join(workingDir, '.dance-of-tal', 'drafts', 'dance', draft.id, 'scripts', 'check.sh'), 'echo ok\n', 'utf-8')

        const exported = await exportDanceBundle({
            cwd: workingDir,
            draftId: draft.id,
            slugInput: 'draft-dance',
            destinationParentPath: exportRoot,
        })

        expect(exported.exportPath).toBe(path.join(exportRoot, 'draft-dance'))
        await expect(fs.access(path.join(exported.exportPath, 'draft.json'))).rejects.toThrow()
        expect(await fs.readFile(path.join(exported.exportPath, 'scripts', 'check.sh'), 'utf-8')).toBe('echo ok\n')

        const parsed = parseDanceFromSkillMd(await fs.readFile(path.join(exported.exportPath, 'SKILL.md'), 'utf-8'))
        expect(parsed.name).toBe('draft-dance')
        expect(parsed.description).toBe('Review code safely')
        expect(parsed.license).toBe('MIT')
        expect(parsed.compatibility).toBe('No special requirements')
        expect(parsed.metadata).toEqual({ author: 'someone', version: '1.0' })
        expect(parsed.allowedTools).toBe('bash,git')
        expect(parsed.content).toContain('Review the pull request.')
    })

    it('requires overwrite confirmation when the destination already exists', async () => {
        const draft = await createDraft(workingDir, {
            kind: 'dance',
            id: 'dance-draft-2',
            name: 'Draft Dance',
            content: [
                '---',
                'name: "draft-dance"',
                'description: "Draft description"',
                '---',
                '',
                '# body',
            ].join('\n'),
        })

        const targetDir = path.join(exportRoot, 'draft-dance')
        await fs.mkdir(targetDir, { recursive: true })
        await fs.writeFile(path.join(targetDir, 'old.txt'), 'stale', 'utf-8')

        await expect(exportDanceBundle({
            cwd: workingDir,
            draftId: draft.id,
            slugInput: 'draft-dance',
            destinationParentPath: exportRoot,
        })).rejects.toThrow(`${DANCE_EXPORT_EXISTS_PREFIX}${targetDir}`)

        const exported = await exportDanceBundle({
            cwd: workingDir,
            draftId: draft.id,
            slugInput: 'draft-dance',
            destinationParentPath: exportRoot,
            overwrite: true,
        })

        await expect(fs.access(path.join(exported.exportPath, 'old.txt'))).rejects.toThrow()
        expect(await fs.readFile(path.join(exported.exportPath, 'SKILL.md'), 'utf-8')).toContain('name: "draft-dance"')
    })

    it('fails clearly when the draft is missing', async () => {
        await expect(exportDanceBundle({
            cwd: workingDir,
            draftId: 'missing-draft',
            slugInput: 'draft-dance',
            destinationParentPath: exportRoot,
        })).rejects.toThrow("Dance draft 'missing-draft' was not found.")
    })

    it('fails clearly when the slug is invalid', async () => {
        const draft = await createDraft(workingDir, {
            kind: 'dance',
            id: 'dance-draft-3',
            name: 'Draft Dance',
            content: [
                '---',
                'name: "draft-dance"',
                'description: "Draft description"',
                '---',
                '',
                '# body',
            ].join('\n'),
        })

        await expect(exportDanceBundle({
            cwd: workingDir,
            draftId: draft.id,
            slugInput: '!!!',
            destinationParentPath: exportRoot,
        })).rejects.toThrow('Dance slug is required.')
    })

    it('fails when SKILL.md does not satisfy the canonical Dance contract', async () => {
        const draft = await createDraft(workingDir, {
            kind: 'dance',
            id: 'dance-draft-4',
            name: 'Draft Dance',
            content: '# Missing frontmatter',
        })

        await expect(exportDanceBundle({
            cwd: workingDir,
            draftId: draft.id,
            slugInput: 'draft-dance',
            destinationParentPath: exportRoot,
        })).rejects.toThrow()
    })
})
