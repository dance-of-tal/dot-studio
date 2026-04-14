import { describe, expect, it } from 'vitest'

import { normalizeImportedPerformerAsset } from './performer-import'

describe('normalizeImportedPerformerAsset', () => {
    it('keeps only currently available MCP names selected during import', () => {
        const normalized = normalizeImportedPerformerAsset({
            name: 'Imported Performer',
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            mcpConfig: {
                github: { command: 'placeholder' },
                sentry: { url: 'https://mcp.sentry.dev/mcp' },
            },
        }, {
            runtimeModels: [
                { provider: 'openai', id: 'gpt-5.4', connected: true },
            ],
            availableMcpServerNames: ['github'],
        })

        expect(normalized.model).toEqual({ provider: 'openai', modelId: 'gpt-5.4' })
        expect(normalized.modelPlaceholder).toEqual({ provider: 'openai', modelId: 'gpt-5.4' })
        expect(normalized.mcpServerNames).toEqual(['github'])
        expect(normalized.mcpConfig).toEqual({
            github: { command: 'placeholder' },
            sentry: { url: 'https://mcp.sentry.dev/mcp' },
        })
    })
})
