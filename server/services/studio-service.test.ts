import { beforeEach, describe, expect, it, vi } from 'vitest'

const readStudioConfigMock = vi.fn()
const writeStudioConfigMock = vi.fn()
const getExplicitActiveProjectDirMock = vi.fn()
const getActiveProjectDirMock = vi.fn()
const setActiveProjectDirMock = vi.fn()
const ensureDotDirMock = vi.fn()
const invalidateAllMock = vi.fn()

vi.mock('../lib/config.js', () => ({
    readStudioConfig: readStudioConfigMock,
    writeStudioConfig: writeStudioConfigMock,
    getExplicitActiveProjectDir: getExplicitActiveProjectDirMock,
    getActiveProjectDir: getActiveProjectDirMock,
    setActiveProjectDir: setActiveProjectDirMock,
}))

vi.mock('../lib/dot-source.js', () => ({
    ensureDotDir: ensureDotDirMock,
}))

vi.mock('../lib/cache.js', () => ({
    invalidateAll: invalidateAllMock,
}))

vi.mock('open', () => ({
    default: vi.fn(),
}))

describe('getStudioConfig', () => {
    beforeEach(() => {
        readStudioConfigMock.mockReset().mockResolvedValue({ theme: 'dark', lastWorkspaceId: 'workspace-1' })
        writeStudioConfigMock.mockReset()
        getExplicitActiveProjectDirMock.mockReset().mockReturnValue(null)
        getActiveProjectDirMock.mockReset().mockReturnValue('/tmp/workspace')
        setActiveProjectDirMock.mockReset()
        ensureDotDirMock.mockReset()
        invalidateAllMock.mockReset()
    })

    it('does not expose the server fallback project directory before a workspace is explicitly activated', async () => {
        const { getStudioConfig } = await import('./studio-service.js')

        await expect(getStudioConfig()).resolves.toEqual({
            theme: 'dark',
            lastWorkspaceId: 'workspace-1',
        })
    })

    it('returns the explicit active workspace directory once Studio has activated one', async () => {
        getExplicitActiveProjectDirMock.mockReturnValue('/tmp/workspace')

        const { getStudioConfig } = await import('./studio-service.js')

        await expect(getStudioConfig()).resolves.toEqual({
            theme: 'dark',
            lastWorkspaceId: 'workspace-1',
            projectDir: '/tmp/workspace',
        })
    })
})
