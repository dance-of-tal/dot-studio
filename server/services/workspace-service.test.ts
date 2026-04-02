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
})
