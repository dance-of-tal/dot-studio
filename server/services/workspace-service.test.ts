import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

const pruneStalePerformerProjectionsMock = vi.fn()
const ensureAssistantAgentMock = vi.fn()

vi.mock('./opencode-projection/stage-projection-service.js', () => ({
    pruneStalePerformerProjections: pruneStalePerformerProjectionsMock,
}))

vi.mock('./studio-assistant/assistant-service.js', () => ({
    ensureAssistantAgent: ensureAssistantAgentMock,
}))

describe('saveWorkspaceSnapshot', () => {
    let studioDir: string

    beforeEach(async () => {
        studioDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-workspace-service-'))
        process.env.STUDIO_DIR = studioDir
        pruneStalePerformerProjectionsMock.mockReset().mockResolvedValue(false)
        ensureAssistantAgentMock.mockReset().mockResolvedValue('studio-assistant')
        vi.resetModules()
    })

    afterEach(async () => {
        delete process.env.STUDIO_DIR
        await fs.rm(studioDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('prunes stale performer projections using the saved performer ids', async () => {
        const { saveWorkspaceSnapshot } = await import('./workspace-service.js')
        const workingDir = path.join(studioDir, 'project')

        const result = await saveWorkspaceSnapshot({
            workingDir,
            performers: [{ id: 'performer-1' }, { id: 'performer-2' }],
            acts: [],
        })

        expect(result.ok).toBe(true)
        expect(pruneStalePerformerProjectionsMock).toHaveBeenCalledWith(workingDir, ['performer-1', 'performer-2'])
    })

    it('lists workspace performers from the saved workspace snapshot', async () => {
        const { saveWorkspaceSnapshot, listWorkspacePerformersForDir } = await import('./workspace-service.js')
        const workingDir = path.join(studioDir, 'project')

        await saveWorkspaceSnapshot({
            workingDir,
            performers: [
                { id: 'performer-1', name: 'Performer 1', model: { provider: 'openai', modelId: 'gpt-5' } },
                { id: 'performer-2', name: 'Performer 2', model: null },
            ],
            acts: [],
        })

        await expect(listWorkspacePerformersForDir(workingDir)).resolves.toEqual([
            { id: 'performer-1', name: 'Performer 1', model: { provider: 'openai', modelId: 'gpt-5' } },
            { id: 'performer-2', name: 'Performer 2', model: null },
        ])
    })

    it('preserves hiddenFromList when saving an already-hidden workspace without that field', async () => {
        const { getSavedWorkspace, saveWorkspaceSnapshot, setSavedWorkspaceHidden } = await import('./workspace-service.js')
        const workingDir = path.join(studioDir, 'project')

        const initialSave = await saveWorkspaceSnapshot({
            workingDir,
            performers: [{ id: 'performer-1' }],
            acts: [],
        })

        expect(initialSave.ok).toBe(true)
        if (!initialSave.ok) {
            return
        }

        await setSavedWorkspaceHidden(initialSave.id, true)
        await saveWorkspaceSnapshot({
            workingDir,
            performers: [{ id: 'performer-1' }, { id: 'performer-2' }],
            acts: [],
        })

        const savedWorkspace = await getSavedWorkspace(initialSave.id)
        expect(savedWorkspace.ok).toBe(true)
        if (!savedWorkspace.ok) {
            return
        }

        expect(savedWorkspace.workspace.hiddenFromList).toBe(true)
    })
})
