import { beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock = vi.fn()
const statusMock = vi.fn()
const readGlobalMcpCatalogMock = vi.fn()
const readProjectMcpServerNamesMock = vi.fn()

vi.mock('./opencode.js', () => ({
    getOpencode: async () => ({
        mcp: {
            connect: connectMock,
            status: statusMock,
        },
    }),
}))

vi.mock('./mcp-catalog.js', () => ({
    readGlobalMcpCatalog: readGlobalMcpCatalogMock,
    readProjectMcpServerNames: readProjectMcpServerNamesMock,
}))

describe('resolveRuntimeTools', () => {
    beforeEach(() => {
        connectMock.mockReset().mockResolvedValue({ data: {} })
        statusMock.mockReset().mockResolvedValue({ data: {} })
        readGlobalMcpCatalogMock.mockReset().mockResolvedValue({
            playwright: {
                type: 'local',
                command: ['npx', '@playwright/mcp@latest'],
            },
        })
        readProjectMcpServerNamesMock.mockReset().mockResolvedValue([])
    })

    it('blocks MCP servers shadowed by project config', async () => {
        readProjectMcpServerNamesMock.mockResolvedValueOnce(['playwright'])

        const { resolveRuntimeTools } = await import('./runtime-tools.js')
        const result = await resolveRuntimeTools(
            '/tmp/workspace',
            null,
            ['playwright'],
        )

        expect(connectMock).not.toHaveBeenCalled()
        expect(result.resolvedTools).toEqual([])
        expect(result.unavailableDetails).toEqual([
            expect.objectContaining({
                serverName: 'playwright',
                reason: 'shadowed_by_project',
            }),
        ])
    })
})
