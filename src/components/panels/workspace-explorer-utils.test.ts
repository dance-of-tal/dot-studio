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
