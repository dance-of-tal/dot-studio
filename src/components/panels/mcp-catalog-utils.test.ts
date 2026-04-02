import { describe, expect, it } from 'vitest'
import { getMcpEntryValidationError } from './mcp-catalog-utils'

describe('mcp-catalog-utils', () => {
    it('rejects duplicate MCP names before save', () => {
        expect(getMcpEntryValidationError([
            {
                key: '1',
                name: 'github',
                transport: 'stdio',
                timeoutText: '',
                command: 'cmd-a',
                args: [],
                env: [],
                url: '',
                headers: [],
                oauthEnabled: true,
                oauthClientId: '',
                oauthClientSecret: '',
                oauthScope: '',
            },
            {
                key: '2',
                name: 'github',
                transport: 'http',
                timeoutText: '',
                command: '',
                args: [],
                env: [],
                url: 'https://mcp.example.com',
                headers: [],
                oauthEnabled: true,
                oauthClientId: '',
                oauthClientSecret: '',
                oauthScope: '',
            },
        ])).toBe("MCP 'github' is duplicated. Server names must be unique.")
    })
})
