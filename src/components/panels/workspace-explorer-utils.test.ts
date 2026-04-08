import { describe, expect, it } from 'vitest'
import {
    groupPerformerSessionsById,
    resolveActThreadActivityAt,
    resolveSessionActivityAt,
    type PerformerSessionRow,
} from './workspace-explorer-utils'

describe('workspace explorer activity helpers', () => {
    it('prefers updated activity over created time for performer sessions', () => {
        const grouped = groupPerformerSessionsById([
            {
                performerId: 'performer-1',
                active: false,
                session: { id: 'session-older', createdAt: 10, updatedAt: 50 },
            },
            {
                performerId: 'performer-1',
                active: true,
                session: { id: 'session-newer', createdAt: 20, updatedAt: 40 },
            },
        ] satisfies PerformerSessionRow[])

        expect(grouped.get('performer-1')?.map((entry) => entry.session.id)).toEqual([
            'session-older',
            'session-newer',
        ])
    })

    it('nests subagent sessions beneath their parent session', () => {
        const grouped = groupPerformerSessionsById([
            {
                performerId: 'performer-1',
                active: false,
                session: { id: 'parent', createdAt: 10, updatedAt: 90 },
            },
            {
                performerId: 'performer-1',
                active: true,
                session: { id: 'child', parentId: 'parent', createdAt: 30, updatedAt: 80 },
            },
            {
                performerId: 'performer-1',
                active: false,
                session: { id: 'sibling', createdAt: 20, updatedAt: 70 },
            },
        ] satisfies PerformerSessionRow[])

        expect(grouped.get('performer-1')).toEqual([
            expect.objectContaining({
                session: expect.objectContaining({ id: 'parent' }),
                depth: 0,
                children: [
                    expect.objectContaining({
                        session: expect.objectContaining({ id: 'child' }),
                        depth: 1,
                    }),
                ],
            }),
            expect.objectContaining({
                session: expect.objectContaining({ id: 'sibling' }),
                depth: 0,
                children: [],
            }),
        ])
    })

    it('uses the latest message timestamp when it is newer than session metadata', () => {
        expect(resolveSessionActivityAt({ createdAt: 10, updatedAt: 20 }, 90)).toBe(90)
    })

    it('uses the most recent participant session for act thread ordering', () => {
        expect(resolveActThreadActivityAt({
            createdAt: 30,
            participantSessions: {
                alpha: 'session-a',
                beta: 'session-b',
            },
        }, {
            'session-a': 80,
            'session-b': 120,
        })).toBe(120)
    })
})
