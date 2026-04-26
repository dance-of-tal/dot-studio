import { describe, expect, it } from 'vitest'
import type { StudioState } from '../types'
import {
    collectActSessionTargets,
    collectActThreadSessionTargets,
    collectPerformerSessionTargets,
} from './session-lifecycle'

describe('session lifecycle cleanup target collection', () => {
    it('collects every participant session under an Act', () => {
        const state = {
            actThreads: {
                'act-1': [{
                    id: 'thread-3',
                    participantSessions: { gamma: 'session-3' },
                }],
            },
            chatKeyToSession: {
                'act:act-1:thread:thread-1:participant:alpha': 'session-1',
                'act:act-1:thread:thread-2:participant:beta': 'session-2',
                'act:act-2:thread:thread-1:participant:alpha': 'session-4',
                'performer-1': 'session-5',
            },
        } as unknown as StudioState

        expect(collectActSessionTargets(state, 'act-1')).toEqual([
            { chatKey: 'act:act-1:thread:thread-1:participant:alpha', sessionId: 'session-1' },
            { chatKey: 'act:act-1:thread:thread-2:participant:beta', sessionId: 'session-2' },
            { chatKey: 'act:act-1:thread:thread-3:participant:gamma', sessionId: 'session-3' },
        ])
    })

    it('collects only participant sessions for the deleted thread', () => {
        const state = {
            actThreads: {
                'act-1': [{
                    id: 'thread-1',
                    participantSessions: { beta: 'session-beta' },
                }],
            },
            chatKeyToSession: {
                'act:act-1:thread:thread-1:participant:alpha': 'session-1',
                'act:act-1:thread:thread-2:participant:alpha': 'session-2',
            },
        } as unknown as StudioState

        expect(collectActThreadSessionTargets(state, 'act-1', 'thread-1')).toEqual([
            { chatKey: 'act:act-1:thread:thread-1:participant:alpha', sessionId: 'session-1' },
            { chatKey: 'act:act-1:thread:thread-1:participant:beta', sessionId: 'session-beta' },
        ])
    })

    it('collects a performer direct session and its Act participant sessions', () => {
        const state = {
            acts: [{
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
                        performerRef: { kind: 'draft', draftId: 'performer-2' },
                        position: { x: 0, y: 0 },
                    },
                },
                relations: [],
                createdAt: 1,
            }],
            actThreads: {
                'act-1': [{
                    id: 'thread-1',
                    participantSessions: {
                        alpha: 'session-alpha',
                        beta: 'session-beta',
                    },
                }],
            },
            chatKeyToSession: {
                'performer-1': 'session-performer',
                'act:act-1:thread:thread-1:participant:alpha': 'session-alpha',
                'act:act-1:thread:thread-1:participant:beta': 'session-beta',
            },
        } as unknown as StudioState

        expect(collectPerformerSessionTargets(state, { id: 'performer-1' })).toEqual([
            { chatKey: 'performer-1', sessionId: 'session-performer' },
            { chatKey: 'act:act-1:thread:thread-1:participant:alpha', sessionId: 'session-alpha' },
        ])
    })
})
