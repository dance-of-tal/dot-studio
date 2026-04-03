import { describe, expect, it } from 'vitest'
import {
    buildActAssetPayload,
    buildActPublishPayload,
    buildPerformerAssetPayload,
    buildPerformerPublishPayload,
    getActPublishDependencyIssues,
    getPerformerDependencyPublishIssues,
    normalizePerformerAssetInput,
} from './performers'

describe('buildPerformerAssetPayload', () => {
    it('keeps portable declared MCP config when exporting performer assets', () => {
        const payload = buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
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
            tal: 'tal/@user/project/reasoning',
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcp_config: {
                github: { command: 'placeholder' },
            },
        })
    })

    it('exports selected MCP server names as portable requirements for scratch performers', () => {
        const payload = buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
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
            tal: 'tal/@user/project/reasoning',
            mcp_config: {
                servers: ['github-prod', 'postgres-readonly'],
            },
        })
    })

    it('reports draft Tal dependencies with a Tal-specific message', () => {
        expect(() => buildPerformerAssetPayload({
            talRef: { kind: 'draft', draftId: 'draft-tal-1' },
            danceRefs: [{ kind: 'registry', urn: 'dance/@user/repo/review-skill' }],
            model: null,
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Review Performer',
        })).toThrow('Tal is still attached as a draft.')
    })

    it('reports draft Dance dependencies with a Dance-specific message', () => {
        expect(() => buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
            danceRefs: [{ kind: 'draft', draftId: 'draft-dance-1' }],
            model: null,
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Review Performer',
        })).toThrow('Draft Dance refs are still attached.')
    })
})

describe('normalizePerformerAssetInput', () => {
    it('preserves modelVariant from imported performer assets', () => {
        const normalized = normalizePerformerAssetInput({
            name: 'Imported Performer',
            urn: 'performer/@user/project/imported',
            talUrn: 'tal/@user/project/reasoning',
            danceUrns: ['dance/@user/repo/style'],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpConfig: {
                github: { command: 'placeholder' },
            },
        })

        expect(normalized.modelVariant).toBe('reasoning-high')
        expect(normalized.meta).toEqual({
            derivedFrom: 'performer/@user/project/imported',
            publishBindingUrn: 'performer/@user/project/imported',
        })
    })
})

describe('getPerformerDependencyPublishIssues', () => {
    it('returns no issues when performer refs are installable', () => {
        expect(getPerformerDependencyPublishIssues({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
            danceRefs: [{ kind: 'registry', urn: 'dance/@user/repo/review-skill' }],
        })).toEqual([])
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

describe('publish cascade builders', () => {
    it('promotes a draft Tal into an in-memory dependency when publishing a performer', () => {
        const result = buildPerformerPublishPayload({
            talRef: { kind: 'draft', draftId: 'tal-draft-1' },
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Reviewer Performer',
            slug: 'reviewer-performer',
            description: 'Reviewer Performer',
            tags: ['review'],
        }, {
            username: 'acme',
            workingDir: '/tmp/agent-presets',
            drafts: {
                'tal-draft-1': {
                    id: 'tal-draft-1',
                    kind: 'tal',
                    name: 'Reviewer Tal',
                    slug: 'reviewer-tal',
                    description: 'Reviewer Tal',
                    tags: ['tal'],
                    content: '# Review carefully',
                    updatedAt: 1,
                    saveState: 'saved',
                },
            },
        })

        expect(result.payload).toMatchObject({
            urn: 'performer/@acme/agent-presets/reviewer-performer',
            payload: {
                tal: 'tal/@acme/agent-presets/reviewer-tal',
            },
        })
        expect(result.providedAssets).toEqual([
            expect.objectContaining({
                kind: 'tal',
                urn: 'tal/@acme/agent-presets/reviewer-tal',
            }),
        ])
    })

    it('promotes a canvas performer and nested draft Tal when publishing an act', () => {
        const result = buildActPublishPayload({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-reviewer': {
                    performerRef: { kind: 'draft', draftId: 'performer-draft-1' },
                    displayName: 'Reviewer',
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        }, {
            slug: 'review-flow',
            description: 'Review Flow',
            tags: ['workflow'],
        }, {
            username: 'acme',
            workingDir: '/tmp/workflows',
            drafts: {
                'tal-draft-1': {
                    id: 'tal-draft-1',
                    kind: 'tal',
                    name: 'Reviewer Tal',
                    slug: 'reviewer-tal',
                    description: 'Reviewer Tal',
                    tags: ['tal'],
                    content: '# Review carefully',
                    updatedAt: 1,
                    saveState: 'saved',
                },
            },
            performers: [
                {
                    id: 'performer-1',
                    name: 'Reviewer Performer',
                    scope: 'shared',
                    position: { x: 0, y: 0 },
                    model: { provider: 'openai', modelId: 'gpt-5' },
                    modelVariant: null,
                    agentId: null,
                    talRef: { kind: 'draft', draftId: 'tal-draft-1' },
                    danceRefs: [],
                    mcpServerNames: [],
                    mcpBindingMap: {},
                    declaredMcpConfig: null,
                    danceDeliveryMode: 'auto',
                    meta: {
                        derivedFrom: 'draft:performer-draft-1',
                        authoring: {
                            slug: 'reviewer-performer',
                            description: 'Reviewer Performer',
                            tags: ['performer'],
                        },
                    },
                },
            ],
        })

        expect(result.payload).toMatchObject({
            urn: 'act/@acme/workflows/review-flow',
            payload: {
                participants: [
                    expect.objectContaining({
                        key: 'Reviewer',
                        performer: 'performer/@acme/workflows/reviewer-performer',
                    }),
                ],
            },
        })
        expect(result.providedAssets.map((asset) => asset.urn)).toEqual([
            'tal/@acme/workflows/reviewer-tal',
            'performer/@acme/workflows/reviewer-performer',
        ])
    })

    it('publishes unsaved canvas performers referenced by act participants', () => {
        const result = buildActPublishPayload({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-reviewer': {
                    performerRef: { kind: 'draft', draftId: 'performer-1' },
                    displayName: 'Reviewer',
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        }, {
            slug: 'review-flow',
            description: 'Review Flow',
            tags: ['workflow'],
        }, {
            username: 'acme',
            workingDir: '/tmp/workflows',
            drafts: {
                'tal-draft-1': {
                    id: 'tal-draft-1',
                    kind: 'tal',
                    name: 'Reviewer Tal',
                    slug: 'reviewer-tal',
                    description: 'Reviewer Tal',
                    tags: ['tal'],
                    content: '# Review carefully',
                    updatedAt: 1,
                    saveState: 'saved',
                },
            },
            performers: [
                {
                    id: 'performer-1',
                    name: 'Reviewer Performer',
                    scope: 'shared',
                    position: { x: 0, y: 0 },
                    model: { provider: 'openai', modelId: 'gpt-5' },
                    modelVariant: null,
                    agentId: null,
                    talRef: { kind: 'draft', draftId: 'tal-draft-1' },
                    danceRefs: [],
                    mcpServerNames: [],
                    mcpBindingMap: {},
                    declaredMcpConfig: null,
                    danceDeliveryMode: 'auto',
                    meta: {
                        authoring: {
                            slug: 'reviewer-performer',
                            description: 'Reviewer Performer',
                            tags: ['performer'],
                        },
                    },
                },
            ],
        })

        expect(result.payload).toMatchObject({
            urn: 'act/@acme/workflows/review-flow',
            payload: {
                participants: [
                    expect.objectContaining({
                        key: 'Reviewer',
                        performer: 'performer/@acme/workflows/reviewer-performer',
                    }),
                ],
            },
        })
        expect(result.providedAssets.map((asset) => asset.urn)).toEqual([
            'tal/@acme/workflows/reviewer-tal',
            'performer/@acme/workflows/reviewer-performer',
        ])
    })

    it('reports draft Dance blockers only for act publish dependency checks', () => {
        expect(getActPublishDependencyIssues({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-reviewer': {
                    performerRef: { kind: 'draft', draftId: 'performer-draft-1' },
                    displayName: 'Reviewer',
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        }, [
            {
                id: 'performer-1',
                name: 'Reviewer Performer',
                scope: 'shared',
                position: { x: 0, y: 0 },
                model: null,
                modelVariant: null,
                agentId: null,
                talRef: null,
                danceRefs: [{ kind: 'draft', draftId: 'dance-draft-1' }],
                mcpServerNames: [],
                mcpBindingMap: {},
                declaredMcpConfig: null,
                danceDeliveryMode: 'auto',
                meta: {
                    derivedFrom: 'draft:performer-draft-1',
                },
            },
        ], {})).toEqual([
            'Draft Dance refs are still attached inside this act. Export them, upload them to GitHub, import them from Asset Library, and re-apply them before publishing this act.',
        ])
    })

    it('treats matching canvas performers as valid act publish dependencies', () => {
        expect(getActPublishDependencyIssues({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-reviewer': {
                    performerRef: { kind: 'draft', draftId: 'performer-1' },
                    displayName: 'Reviewer',
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        }, [
            {
                id: 'performer-1',
                name: 'Reviewer Performer',
                scope: 'shared',
                position: { x: 0, y: 0 },
                model: { provider: 'openai', modelId: 'gpt-5' },
                modelVariant: null,
                agentId: null,
                talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
                danceRefs: [],
                mcpServerNames: [],
                mcpBindingMap: {},
                declaredMcpConfig: null,
                danceDeliveryMode: 'auto',
            },
        ], {})).toEqual([])
    })

    it('reports missing canvas performers as act publish blockers', () => {
        expect(getActPublishDependencyIssues({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-reviewer': {
                    performerRef: { kind: 'draft', draftId: 'performer-1' },
                    displayName: 'Reviewer',
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        }, [], {})).toEqual([
            'Participant "Reviewer" is missing its performer on the canvas. Re-attach the performer before publishing this act.',
        ])
    })
})
