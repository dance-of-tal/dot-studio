import { beforeEach, describe, expect, it, vi } from 'vitest'

const isManagedOpencodeMock = vi.fn()
const getActiveProjectDirMock = vi.fn()
const listSavedWorkspacesMock = vi.fn()
const ensureAssistantAgentMock = vi.fn()

vi.mock('../../lib/opencode-sidecar.js', () => ({
    isManagedOpencode: isManagedOpencodeMock,
}))

vi.mock('../../lib/config.js', () => ({
    getActiveProjectDir: getActiveProjectDirMock,
}))

vi.mock('../workspace-service.js', () => ({
    listSavedWorkspaces: listSavedWorkspacesMock,
}))

vi.mock('./assistant-service.js', () => ({
    ensureAssistantAgent: ensureAssistantAgentMock,
}))

describe('refreshAssistantProjectionOnServerStartup', () => {
    beforeEach(() => {
        isManagedOpencodeMock.mockReset().mockReturnValue(true)
        getActiveProjectDirMock.mockReset().mockReturnValue('/tmp/source-root')
        listSavedWorkspacesMock.mockReset().mockResolvedValue([
            { id: 'a', workingDir: '/tmp/work-a', updatedAt: 1 },
            { id: 'b', workingDir: '/tmp/work-b', updatedAt: 2 },
            { id: 'c', workingDir: '/tmp/work-a', updatedAt: 3 },
        ])
        ensureAssistantAgentMock.mockReset().mockResolvedValue('dot-studio/studio-assistant')
    })

    it('refreshes assistant projection for the current active dir and all saved workspaces in managed mode', async () => {
        const { refreshAssistantProjectionOnServerStartup } = await import('./assistant-startup-service.js')

        await refreshAssistantProjectionOnServerStartup()

        expect(listSavedWorkspacesMock).toHaveBeenCalledWith(true)
        expect(ensureAssistantAgentMock).toHaveBeenCalledTimes(3)
        expect(ensureAssistantAgentMock).toHaveBeenNthCalledWith(1, '/tmp/source-root')
        expect(ensureAssistantAgentMock).toHaveBeenNthCalledWith(2, '/tmp/work-a')
        expect(ensureAssistantAgentMock).toHaveBeenNthCalledWith(3, '/tmp/work-b')
    })

    it('skips startup projection refresh when Studio is attached to external OpenCode', async () => {
        isManagedOpencodeMock.mockReturnValue(false)

        const { refreshAssistantProjectionOnServerStartup } = await import('./assistant-startup-service.js')

        await refreshAssistantProjectionOnServerStartup()

        expect(listSavedWorkspacesMock).not.toHaveBeenCalled()
        expect(ensureAssistantAgentMock).not.toHaveBeenCalled()
    })
})
