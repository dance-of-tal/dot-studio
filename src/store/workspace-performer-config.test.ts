import { describe, expect, it } from 'vitest'

import { createPerformerNode } from '../lib/performers-node'
import { removePerformerDance } from './workspace-performer-config'
import type { StudioState } from './types'

function makeState(): StudioState {
    return {
        performers: [
            createPerformerNode({
                id: 'performer-1',
                name: 'Reviewer',
                x: 0,
                y: 0,
                danceRefs: [
                    { kind: 'draft', draftId: 'dance-draft-1' },
                    { kind: 'registry', urn: 'dance/@acme/review-checks' },
                ],
            }),
        ],
        acts: [],
        actThreads: {},
        workspaceDirty: false,
    } as unknown as StudioState
}

describe('workspace-performer-config', () => {
    it('removes draft dance refs by plain draft id', () => {
        let state = makeState()
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        removePerformerDance(set, get, 'performer-1', 'dance-draft-1')

        expect(state.performers[0].danceRefs).toEqual([
            { kind: 'registry', urn: 'dance/@acme/review-checks' },
        ])
    })

    it('still removes registry dance refs by URN', () => {
        let state = makeState()
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        removePerformerDance(set, get, 'performer-1', 'dance/@acme/review-checks')

        expect(state.performers[0].danceRefs).toEqual([
            { kind: 'draft', draftId: 'dance-draft-1' },
        ])
    })
})
