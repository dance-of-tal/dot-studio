import { describe, expect, it } from 'vitest'
import type { PerformerNode, WorkspaceAct } from '../../types'
import {
    filterBoardEntries,
    getBoardKindCounts,
    getEventDescription,
    mergeActivityPages,
    resolveBoardActorLabel,
} from './act-board-view-utils'

const performers: PerformerNode[] = [
    {
        id: 'performer-1',
        name: 'Coder',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
        danceDeliveryMode: 'auto',
    },
    {
        id: 'performer-2',
        name: 'Reviewer',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
        danceDeliveryMode: 'auto',
    },
]

const act: WorkspaceAct = {
    id: 'act-1',
    name: 'Test Act',
    position: { x: 0, y: 0 },
    width: 640,
    height: 480,
    createdAt: 1,
    participants: {
        'participant-1': {
            performerRef: { kind: 'draft', draftId: 'performer-1' },
            position: { x: 0, y: 0 },
            displayName: 'Backup Coder',
        },
        'participant-2': {
            performerRef: { kind: 'draft', draftId: 'performer-2' },
            position: { x: 0, y: 0 },
        },
    },
    relations: [],
}

describe('act-board-view-utils', () => {
    it('resolves participant author labels to performer names', () => {
        expect(resolveBoardActorLabel(act, performers, 'participant-1')).toBe('Coder')
    })

    it('falls back to the raw actor when no participant binding exists', () => {
        expect(resolveBoardActorLabel(act, performers, 'participant-missing')).toBe('participant-missing')
        expect(resolveBoardActorLabel(act, performers, 'studio')).toBe('studio')
    })

    it('formats activity copy with participant names for board and message events', () => {
        expect(getEventDescription({
            id: 'evt-1',
            type: 'board.updated',
            source: 'participant-1',
            timestamp: 1,
            payload: { key: 'api-spec' },
        }, act, performers)).toBe('Coder updated "api-spec"')

        expect(getEventDescription({
            id: 'evt-2',
            type: 'message.sent',
            source: 'participant-1',
            timestamp: 2,
            payload: { to: 'participant-2', tag: 'handoff' },
        }, act, performers)).toBe('Coder -> Reviewer [handoff]')
    })

    it('treats note entries as artifacts and excludes the removed all filter', () => {
        const entries = [
            { kind: 'artifact' as const, key: 'artifact-1' },
            { kind: 'note' as const, key: 'note-1' },
            { kind: 'finding' as const, key: 'finding-1' },
            { kind: 'task' as const, key: 'task-1' },
        ]

        expect(filterBoardEntries(entries, 'artifact').map((entry) => entry.key)).toEqual(['artifact-1', 'note-1'])
        expect(getBoardKindCounts(entries)).toEqual({
            artifact: 2,
            finding: 1,
            task: 1,
        })
    })

    it('merges latest and older activity pages without duplicates', () => {
        const current = [
            { id: 'evt-3', type: 'board.updated', source: 'participant-1', timestamp: 300, payload: {} },
            { id: 'evt-2', type: 'board.updated', source: 'participant-1', timestamp: 200, payload: {} },
        ]
        const latest = [
            { id: 'evt-4', type: 'board.updated', source: 'participant-1', timestamp: 400, payload: {} },
            { id: 'evt-3', type: 'board.updated', source: 'participant-1', timestamp: 300, payload: {} },
        ]
        const older = [
            { id: 'evt-1', type: 'board.updated', source: 'participant-1', timestamp: 100, payload: {} },
        ]

        expect(mergeActivityPages(current, latest, 'prependLatest').map((event) => event.id)).toEqual(['evt-4', 'evt-3', 'evt-2'])
        expect(mergeActivityPages(current, older, 'appendOlder').map((event) => event.id)).toEqual(['evt-3', 'evt-2', 'evt-1'])
    })
})
