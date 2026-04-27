import { beforeAll, describe, expect, it } from 'vitest'

let buildAuthoringPayloadForPublishApi: typeof import('./publish-modal-utils').buildAuthoringPayloadForPublishApi
let buildPublishFormSeed: typeof import('./publish-modal-utils').buildPublishFormSeed

beforeAll(async () => {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
        },
    })

    ;({ buildAuthoringPayloadForPublishApi, buildPublishFormSeed } = await import('./publish-modal-utils'))
})

describe('buildAuthoringPayloadForPublishApi', () => {
    it('unwraps canonical act assets into the authoring payload expected by the publish API', () => {
        expect(buildAuthoringPayloadForPublishApi({
            description: 'Review Flow',
            tags: ['workflow'],
            payload: {
                participants: [
                    { key: 'Reviewer', performer: 'performer/@acme/moneymaker/reviewer' },
                ],
                relations: [],
            },
        })).toEqual({
            description: 'Review Flow',
            tags: ['workflow'],
            participants: [
                { key: 'Reviewer', performer: 'performer/@acme/moneymaker/reviewer' },
            ],
            relations: [],
        })
    })

    it('unwraps canonical performer assets without losing model ids', () => {
        expect(buildAuthoringPayloadForPublishApi({
            description: 'Reviewer Performer',
            tags: ['review'],
            payload: {
                tal: 'tal/@acme/moneymaker/reviewer-tal',
                model: {
                    provider: 'openai',
                    modelId: 'gpt-5.4',
                },
                modelVariant: 'reasoning-high',
            },
        })).toEqual({
            description: 'Reviewer Performer',
            tags: ['review'],
            tal: 'tal/@acme/moneymaker/reviewer-tal',
            model: {
                provider: 'openai',
                modelId: 'gpt-5.4',
            },
            modelVariant: 'reasoning-high',
        })
    })
})

describe('buildPublishFormSeed', () => {
    it('prefills act publish fields from authoring metadata and canvas description', () => {
        expect(buildPublishFormSeed({
            act: {
                id: 'act-1',
                name: 'Review Flow',
                description: 'Coordinate review and approval.',
                position: { x: 0, y: 0 },
                width: 320,
                height: 200,
                participants: {},
                relations: [],
                createdAt: 1,
                meta: {
                    authoring: {
                        slug: 'review-flow',
                        description: 'Registry-ready review workflow',
                        tags: ['workflow', 'review'],
                    },
                },
            },
        })).toEqual({
            slug: 'review-flow',
            description: 'Registry-ready review workflow',
            tagsText: 'workflow, review',
        })
    })

    it('falls back to the canvas act description when authoring description is unset', () => {
        expect(buildPublishFormSeed({
            act: {
                id: 'act-2',
                name: 'Launch Flow',
                description: 'Ship the launch checklist end-to-end.',
                position: { x: 0, y: 0 },
                width: 320,
                height: 200,
                participants: {},
                relations: [],
                createdAt: 1,
            },
        })).toEqual({
            slug: 'launch-flow',
            description: 'Ship the launch checklist end-to-end.',
            tagsText: '',
        })
    })

    it('prefills stage from local asset URNs', () => {
        expect(buildPublishFormSeed({
            localItem: {
                kind: 'tal',
                source: 'local',
                urn: 'tal/@acme/launch-stage/reviewer-tal',
                name: 'reviewer-tal',
                slug: 'reviewer-tal',
            },
        })).toEqual({
            slug: 'reviewer-tal',
            stage: 'launch-stage',
            description: 'reviewer-tal',
            tagsText: '',
        })
    })
})
