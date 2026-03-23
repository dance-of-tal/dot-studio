import { describe, expect, it } from 'vitest'

import { addActRelationImpl } from './act-slice-actions'

describe('addActRelationImpl', () => {
    it('allows opposite one-way relations for the same participant pair', () => {
        let state: any = {
            acts: [
                {
                    id: 'act-1',
                    participants: {
                        Coder: { performerRef: { kind: 'registry', urn: 'performer/@studio/coder' }, position: { x: 0, y: 0 } },
                        Reviewer: { performerRef: { kind: 'registry', urn: 'performer/@studio/reviewer' }, position: { x: 1, y: 0 } },
                    },
                    relations: [
                        {
                            id: 'rel-1',
                            between: ['Coder', 'Reviewer'],
                            direction: 'one-way',
                            name: 'request_review',
                            description: 'Coder asks for review',
                        },
                    ],
                },
            ],
            performers: [],
        }

        const get = () => state
        const set = (partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...next }
        }

        const relationId = addActRelationImpl(get, set, 'act-1', ['Reviewer', 'Coder'], 'one-way')

        expect(relationId).toBeTruthy()
        expect(state.acts[0].relations).toHaveLength(2)
        expect(state.acts[0].relations[1].between).toEqual(['Reviewer', 'Coder'])
    })

    it('blocks duplicate exact one-way relations', () => {
        let state: any = {
            acts: [
                {
                    id: 'act-1',
                    participants: {
                        Coder: { performerRef: { kind: 'registry', urn: 'performer/@studio/coder' }, position: { x: 0, y: 0 } },
                        Reviewer: { performerRef: { kind: 'registry', urn: 'performer/@studio/reviewer' }, position: { x: 1, y: 0 } },
                    },
                    relations: [
                        {
                            id: 'rel-1',
                            between: ['Coder', 'Reviewer'],
                            direction: 'one-way',
                            name: 'request_review',
                            description: 'Coder asks for review',
                        },
                    ],
                },
            ],
            performers: [],
        }

        const get = () => state
        const set = (partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...next }
        }

        const relationId = addActRelationImpl(get, set, 'act-1', ['Coder', 'Reviewer'], 'one-way')

        expect(relationId).toBe('rel-1')
        expect(state.acts[0].relations).toHaveLength(1)
    })
})
