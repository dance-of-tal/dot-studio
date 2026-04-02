import { describe, expect, it } from 'vitest'
import { mergeMcpToolOverrides } from './mcp-catalog'

describe('mergeMcpToolOverrides', () => {
    it('replaces Studio-managed MCP tool globs and preserves unrelated tool config', () => {
        expect(mergeMcpToolOverrides(
            {
                bash: true,
                'github_*': false,
                'legacy_*': false,
            },
            {
                github: {
                    type: 'local',
                    command: ['npx', '-y', '@example/github-mcp'],
                },
            },
            {
                sentry: {
                    type: 'remote',
                    url: 'https://mcp.sentry.dev/mcp',
                },
            },
        )).toEqual({
            bash: true,
            'legacy_*': false,
            'sentry_*': false,
        })
    })
})
