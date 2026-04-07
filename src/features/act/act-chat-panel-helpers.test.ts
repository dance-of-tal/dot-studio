import { describe, expect, it } from 'vitest'
import type { PerformerNode, WorkspaceAct } from '../../types'
import {
    buildActiveActParticipantChatKey,
    buildActParticipantLoadingStates,
    resolveActiveActParticipantKey,
    resolveActParticipantPerformer,
} from './act-chat-panel-helpers'

const baseAct: WorkspaceAct = {
    id: 'act-1',
    name: 'Act',
    position: { x: 0, y: 0 },
    width: 400,
    height: 300,
    participants: {
        alpha: {
            performerRef: { kind: 'draft', draftId: 'performer-1' },
            position: { x: 0, y: 0 },
        },
        beta: {
            performerRef: { kind: 'registry', urn: 'performer://beta' },
            position: { x: 10, y: 10 },
        },
    },
    relations: [],
    createdAt: Date.now(),
}

const performers: PerformerNode[] = [
    {
        id: 'performer-1',
        name: 'Alpha',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
    },
    {
        id: 'performer-2',
        name: 'Beta',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
        meta: {
            derivedFrom: 'performer://beta',
        },
    },
]

describe('act chat panel helpers', () => {
    it('resolves the active participant unless the board is selected', () => {
        expect(resolveActiveActParticipantKey(['alpha', 'beta'], 'thread-1', 'beta')).toEqual({
            isCallboardView: false,
            activeParticipantKey: 'beta',
        })
        expect(resolveActiveActParticipantKey(['alpha', 'beta'], 'thread-1', null)).toEqual({
            isCallboardView: true,
            activeParticipantKey: null,
        })
        expect(resolveActiveActParticipantKey(['alpha', 'beta'], null, null)).toEqual({
            isCallboardView: false,
            activeParticipantKey: 'alpha',
        })
    })

    it('builds active participant chat keys and loading states', () => {
        expect(buildActiveActParticipantChatKey('act-1', 'thread-1', 'alpha')).toBe(
            'act:act-1:thread:thread-1:participant:alpha',
        )
        expect(buildActiveActParticipantChatKey('act-1', null, 'alpha')).toBeNull()

        expect(buildActParticipantLoadingStates({
            currentThread: {
                id: 'thread-1',
                actId: 'act-1',
                status: 'idle',
                participantSessions: {
                    alpha: 'session-1',
                    beta: 'session-2',
                },
                participantStatuses: {
                    alpha: { type: 'busy', updatedAt: 1 },
                    beta: { type: 'idle', updatedAt: 1 },
                },
                createdAt: 1,
            },
            participantKeys: ['alpha', 'beta'],
        })).toEqual(new Map([
            ['alpha', true],
            ['beta', false],
        ]))
    })

    it('treats idle participant runtime states as not loading', () => {
        expect(buildActParticipantLoadingStates({
            currentThread: {
                id: 'thread-1',
                actId: 'act-1',
                status: 'idle',
                participantSessions: {
                    alpha: 'session-1',
                },
                participantStatuses: {
                    alpha: { type: 'idle', updatedAt: 1 },
                },
                createdAt: 1,
            },
            participantKeys: ['alpha'],
        })).toEqual(new Map([
            ['alpha', false],
        ]))
    })

    it('resolves draft and registry participant performers', () => {
        expect(resolveActParticipantPerformer(baseAct, 'alpha', performers)?.name).toBe('Alpha')
        expect(resolveActParticipantPerformer(baseAct, 'beta', performers)?.name).toBe('Beta')
        expect(resolveActParticipantPerformer(baseAct, 'missing', performers)).toBeNull()
        expect(resolveActParticipantPerformer(null, 'alpha', performers)).toBeNull()
    })
})
