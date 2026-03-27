import { describe, expect, it } from 'vitest'
import { buildActAssetPayload, buildPerformerAssetPayload, normalizePerformerAssetInput } from './performers-publish'

describe('buildPerformerAssetPayload', () => {
    it('keeps portable declared MCP config when exporting performer assets', () => {
        const payload = buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/reasoning' },
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpServerNames: ['project-github'],
            mcpBindingMap: { github: 'project-github' },
            declaredMcpConfig: {
                github: { command: 'placeholder' },
            },
        }, {
            name: 'Research Performer',
        })

        expect(payload.payload).toMatchObject({
            tal: 'tal/@user/reasoning',
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcp_config: {
                github: { command: 'placeholder' },
            },
        })
    })

    it('exports selected MCP server names as portable requirements for scratch performers', () => {
        const payload = buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/reasoning' },
            danceRefs: [],
            model: null,
            modelVariant: null,
            mcpServerNames: ['github-prod', 'postgres-readonly'],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Tool Performer',
        })

        expect(payload.payload).toMatchObject({
            tal: 'tal/@user/reasoning',
            mcp_config: {
                servers: ['github-prod', 'postgres-readonly'],
            },
        })
    })
})

describe('normalizePerformerAssetInput', () => {
    it('preserves modelVariant from imported performer assets', () => {
        const normalized = normalizePerformerAssetInput({
            name: 'Imported Performer',
            urn: 'performer/@user/imported',
            talUrn: 'tal/@user/reasoning',
            danceUrns: ['dance/@user/style'],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpConfig: {
                github: { command: 'placeholder' },
            },
        })

        expect(normalized.modelVariant).toBe('reasoning-high')
        expect(normalized.meta).toEqual({
            derivedFrom: 'performer/@user/imported',
            publishBindingUrn: 'performer/@user/imported',
        })
    })
})

describe('buildActAssetPayload', () => {
    it('requires relation descriptions at the canonical asset boundary', () => {
        expect(() => buildActAssetPayload({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-lead': {
                    performerRef: { kind: 'registry', urn: 'performer/@studio/main/lead' },
                    displayName: 'Lead',
                    position: { x: 0, y: 0 },
                },
                'participant-reviewer': {
                    performerRef: { kind: 'registry', urn: 'performer/@studio/main/reviewer' },
                    displayName: 'Reviewer',
                    position: { x: 100, y: 0 },
                },
            },
            relations: [
                {
                    id: 'rel-1',
                    between: ['participant-lead', 'participant-reviewer'],
                    direction: 'both',
                    name: 'Review Loop',
                    description: '',
                },
            ],
            createdAt: Date.now(),
        })).toThrow('requires a description')
    })
})
