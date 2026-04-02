import { describe, expect, it } from 'vitest'
import { summarizeMcpCatalog } from './mcp-catalog.js'

describe('summarizeMcpCatalog', () => {
    it('marks global MCPs as failed when a workspace shadows them with project MCP config', () => {
        const summary = summarizeMcpCatalog(
            {
                playwright: {
                    type: 'local',
                    command: ['npx', '@playwright/mcp@latest'],
                },
            },
            {
                playwright: {
                    status: 'connected',
                },
            },
            ['playwright'],
        )

        expect(summary).toEqual([
            expect.objectContaining({
                name: 'playwright',
                status: 'failed',
                error: expect.stringContaining('project MCP'),
            }),
        ])
    })
})
