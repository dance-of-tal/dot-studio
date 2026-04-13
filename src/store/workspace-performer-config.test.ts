import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPerformerNode } from '../lib/performers-node'
import { removePerformerDance, setPerformerModel, setPerformerModelVariant } from './workspace-performer-config'
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
        recordStudioChange: () => {},
        saveWorkspace: vi.fn(async () => {}),
    } as unknown as StudioState
}

describe('workspace-performer-config', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

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

    it('clears modelVariant when the model changes', () => {
        let state = {
            ...makeState(),
            performers: [
                createPerformerNode({
                    id: 'performer-1',
                    name: 'Reviewer',
                    x: 0,
                    y: 0,
                    model: { provider: 'openai', modelId: 'gpt-5.4' },
                    modelVariant: 'high',
                }),
            ],
        }
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        setPerformerModel(set, get, 'performer-1', { provider: 'anthropic', modelId: 'claude-sonnet-4' })

        expect(state.performers[0].modelVariant).toBeNull()
    })

    it('persists workspace for live Act performer runtime changes without requiring Act sync', async () => {
        let state = {
            ...makeState(),
            workspaceDirty: true,
            acts: [{
                id: 'act-1',
                name: 'Review Flow',
                position: { x: 0, y: 0 },
                width: 400,
                height: 300,
                participants: {
                    reviewer: {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        position: { x: 0, y: 0 },
                    },
                },
                relations: [],
                createdAt: Date.now(),
            }],
            actThreads: {
                'act-1': [{
                    id: 'thread-1',
                    actId: 'act-1',
                    status: 'active',
                    participantSessions: {},
                    participantStatuses: {},
                    createdAt: Date.now(),
                }],
            },
        } as unknown as StudioState
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        setPerformerModelVariant(set, get, 'performer-1', 'high')
        await vi.advanceTimersByTimeAsync(350)

        expect(state.saveWorkspace).toHaveBeenCalledTimes(1)
    })
})
