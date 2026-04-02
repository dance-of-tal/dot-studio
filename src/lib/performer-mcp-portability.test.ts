import { describe, expect, it } from 'vitest'
import { resolvePerformerMcpPortability } from '../../shared/performer-mcp-portability'

describe('resolvePerformerMcpPortability', () => {
    it('splits declared MCP servers into matched and missing names', () => {
        expect(resolvePerformerMcpPortability({
            servers: {
                github: { command: 'npx' },
                notion: { url: 'https://mcp.example.com' },
            },
        }, ['github', 'postgres'])).toEqual({
            declaredMcpServerNames: ['github', 'notion'],
            matchedMcpServerNames: ['github'],
            missingMcpServerNames: ['notion'],
        })
    })

    it('returns empty groups when a performer has no declared MCP config', () => {
        expect(resolvePerformerMcpPortability(null, ['github'])).toEqual({
            declaredMcpServerNames: [],
            matchedMcpServerNames: [],
            missingMcpServerNames: [],
        })
    })
})
