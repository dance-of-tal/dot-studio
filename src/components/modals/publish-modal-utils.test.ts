import { beforeAll, describe, expect, it } from 'vitest'

let buildAuthoringPayloadForPublishApi: typeof import('./publish-modal-utils').buildAuthoringPayloadForPublishApi

beforeAll(async () => {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
        },
    })

    ;({ buildAuthoringPayloadForPublishApi } = await import('./publish-modal-utils'))
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
