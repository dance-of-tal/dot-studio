import { describe, expect, it } from 'vitest'
import { createPerformerNode } from '../../lib/performers-node'
import {
    applyMcpCatalogImpactToPerformers,
    buildMcpCatalogImpact,
    getMcpEntryValidationError,
    type McpEntryDraft,
} from './mcp-catalog-utils'

function createDraft(overrides: Partial<McpEntryDraft>): McpEntryDraft {
    return {
        key: 'draft',
        name: '',
        transport: 'stdio',
        timeoutText: '',
        command: '',
        args: [],
        env: [],
        url: '',
        headers: [],
        oauthEnabled: true,
        oauthClientId: '',
        oauthClientSecret: '',
        oauthScope: '',
        ...overrides,
    }
}

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

    it('builds rename and delete impact against performer references', () => {
        const performers = [
            createPerformerNode({
                id: 'performer-1',
                name: 'Planner',
                x: 0,
                y: 0,
                mcpServerNames: ['github', 'postgres'],
                mcpBindingMap: {
                    prod: 'github',
                },
            }),
            createPerformerNode({
                id: 'performer-2',
                name: 'Writer',
                x: 0,
                y: 0,
                mcpServerNames: ['filesystem'],
                mcpBindingMap: {
                    archive: 'filesystem',
                },
            }),
        ]

        const impact = buildMcpCatalogImpact(
            [
                createDraft({ key: 'github', name: 'github', command: 'npx' }),
                createDraft({ key: 'filesystem', name: 'filesystem', command: 'npx' }),
            ],
            [
                createDraft({ key: 'github', name: 'github-prod', command: 'npx' }),
            ],
            performers,
        )

        expect(impact).toEqual({
            renames: [{
                key: 'github',
                previousName: 'github',
                nextName: 'github-prod',
                affectedPerformerIds: ['performer-1'],
            }],
            deletes: [{
                key: 'filesystem',
                name: 'filesystem',
                affectedPerformerIds: ['performer-2'],
            }],
            affectedPerformerIds: ['performer-1', 'performer-2'],
            affectedPerformerNames: ['Planner', 'Writer'],
        })
    })

    it('rewrites performer MCP selections and bindings for rename/delete impact', () => {
        const performers = [
            createPerformerNode({
                id: 'performer-1',
                name: 'Planner',
                x: 0,
                y: 0,
                mcpServerNames: ['github', 'filesystem'],
                mcpBindingMap: {
                    prod: 'github',
                    archive: 'filesystem',
                },
                meta: {
                    publishBindingUrn: 'performer/@acme/planner',
                },
            }),
            createPerformerNode({
                id: 'performer-2',
                name: 'Writer',
                x: 0,
                y: 0,
                mcpServerNames: ['playwright'],
            }),
        ]

        const nextPerformers = applyMcpCatalogImpactToPerformers(performers, {
            renames: [{
                key: 'github',
                previousName: 'github',
                nextName: 'github-prod',
                affectedPerformerIds: ['performer-1'],
            }],
            deletes: [{
                key: 'filesystem',
                name: 'filesystem',
                affectedPerformerIds: ['performer-1'],
            }],
            affectedPerformerIds: ['performer-1'],
            affectedPerformerNames: ['Planner'],
        })

        expect(nextPerformers[0]).toEqual(expect.objectContaining({
            mcpServerNames: ['github-prod'],
            mcpBindingMap: {
                prod: 'github-prod',
            },
            meta: expect.objectContaining({
                publishBindingUrn: null,
            }),
        }))
        expect(nextPerformers[1]).toBe(performers[1])
    })
})
