import { describe, it, expect } from 'vitest'
import {
    buildActThreadSelectionState,
    buildDeletedActThreadState,
    buildActEditorSelectionState,
    createActEditorState,
    normalizeSubscriptions,
    fallbackParticipantLabel,
    autoLayoutBindings,
    buildActSelectionState,
    buildSelectActState,
    collectRemovedActParticipantChatKeys,
    createActParticipantBinding,
    findExistingParticipantKey,
    listActThreadChatKeys,
    performerNodeToActRef,
    resolveActEditorStateAfterRelationRemoval,
    resolveSelectedActThreadState,
    resolveActParticipantName,
    sameActParticipantRef,
} from './act-slice-helpers'
import type { PerformerNode, WorkspaceAct, WorkspaceActParticipantBinding } from '../types'
import type { StudioState } from './types'

describe('normalizeSubscriptions', () => {
    it('returns null/undefined as-is', () => {
        expect(normalizeSubscriptions(null)).toBeNull()
        expect(normalizeSubscriptions(undefined)).toBeUndefined()
    })

    it('passes through valid subscriptions', () => {
        const input: Record<string, unknown> = { callboardKeys: ['a', 'b'], other: true }
        const result = normalizeSubscriptions(input)
        expect(result.callboardKeys).toEqual(['a', 'b'])
        expect(result.other).toBe(true)
    })

    it('preserves subscriptions without callboardKeys', () => {
        const input: Record<string, unknown> = { other: 'value' }
        const result = normalizeSubscriptions(input)
        expect(result.other).toBe('value')
        expect(result.callboardKeys).toBeUndefined()
    })
})

describe('fallbackParticipantLabel', () => {
    it('returns draftId for draft refs', () => {
        expect(fallbackParticipantLabel({ kind: 'draft', draftId: 'my-draft' })).toBe('my-draft')
    })

    it('returns last segment of URN for registry refs', () => {
        expect(fallbackParticipantLabel({ kind: 'registry', urn: 'performer/@user/my-performer' })).toBe('my-performer')
    })

    it('returns full URN when no slash', () => {
        expect(fallbackParticipantLabel({ kind: 'registry', urn: 'single' })).toBe('single')
    })
})

describe('autoLayoutBindings', () => {
    it('returns empty object for empty bindings', () => {
        expect(autoLayoutBindings({})).toEqual({})
    })

    it('positions single binding at origin', () => {
        const result = autoLayoutBindings({
            k1: { performerRef: { kind: 'draft', draftId: 'd1' }, position: { x: 0, y: 0 } },
        })
        expect(result.k1.position).toEqual({ x: 40, y: 120 })
    })

    it('lays out 3 entries in a single row', () => {
        const bindings: Record<string, WorkspaceActParticipantBinding> = {}
        for (let i = 0; i < 3; i++) {
            bindings[`k${i}`] = {
                performerRef: { kind: 'draft', draftId: `d${i}` },
                position: { x: 0, y: 0 },
            }
        }
        const result = autoLayoutBindings(bindings)
        // 3 entries → 3 columns, so all y = 120 (row 0)
        expect(result.k0.position.y).toBe(120)
        expect(result.k1.position.y).toBe(120)
        expect(result.k2.position.y).toBe(120)
        // x should increment by gapX (260)
        expect(result.k1.position.x - result.k0.position.x).toBe(260)
    })

    it('wraps to next row for 4+ entries', () => {
        const bindings: Record<string, WorkspaceActParticipantBinding> = {}
        for (let i = 0; i < 4; i++) {
            bindings[`k${i}`] = {
                performerRef: { kind: 'draft', draftId: `d${i}` },
                position: { x: 0, y: 0 },
            }
        }
        const result = autoLayoutBindings(bindings)
        // 4 entries → columns = min(3, ceil(sqrt(4))) = 2
        // k0: (40, 120), k1: (300, 120), k2: (40, 300), k3: (300, 300)
        expect(result.k0.position.y).toBe(120)
        expect(result.k2.position.y).toBe(120 + 180) // gapY = 180
    })
})

describe('participant binding helpers', () => {
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

    const act: WorkspaceAct = {
        id: 'act-1',
        name: 'Act',
        position: { x: 0, y: 0 },
        width: 400,
        height: 300,
        participants: {
            alpha: {
                performerRef: { kind: 'draft', draftId: 'performer-1' },
                displayName: 'Alpha Display',
                position: { x: 0, y: 0 },
            },
        },
        relations: [],
        createdAt: Date.now(),
    }

    it('compares and derives participant refs', () => {
        expect(sameActParticipantRef(
            { kind: 'draft', draftId: 'performer-1' },
            { kind: 'draft', draftId: 'performer-1' },
        )).toBe(true)
        expect(sameActParticipantRef(
            { kind: 'registry', urn: 'performer://beta' },
            { kind: 'registry', urn: 'performer://beta' },
        )).toBe(true)
        expect(performerNodeToActRef(performers[0])).toEqual({ kind: 'draft', draftId: 'performer-1' })
        expect(performerNodeToActRef(performers[1])).toEqual({ kind: 'registry', urn: 'performer://beta' })
        expect(performerNodeToActRef({
            ...performers[0],
            meta: { derivedFrom: 'draft:performer-draft-1' },
        })).toEqual({ kind: 'draft', draftId: 'performer-draft-1' })
    })

    it('resolves participant names, existing keys, and bindings consistently', () => {
        expect(resolveActParticipantName(performers, act.participants.alpha, 'alpha')).toBe('Alpha')
        expect(findExistingParticipantKey(act, { kind: 'draft', draftId: 'performer-1' })).toBe('alpha')

        const created = createActParticipantBinding({
            act,
            performers,
            performerRef: { kind: 'registry', urn: 'performer://beta' },
        })
        expect(created.binding.displayName).toBe('Beta')
        expect(created.binding.position).toEqual({ x: 300, y: 100 })
    })

    it('builds act selection state without clearing the active act editor', () => {
        expect(buildActSelectionState({
            actEditorState: { actId: 'act-1', mode: 'participant', participantKey: 'alpha', relationId: null },
        } as unknown as StudioState, 'act-1')).toEqual({
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: { actId: 'act-1', mode: 'participant', participantKey: 'alpha', relationId: null },
        })
    })

    it('builds editor selection state while clearing performer session selection', () => {
        expect(buildActEditorSelectionState({
            selectedPerformerId: 'performer-1',
            selectedPerformerSessionId: 'session-1',
            actEditorState: null,
        } as unknown as StudioState, 'act-1', {
            actId: 'act-1',
            mode: 'relation',
            participantKey: null,
            relationId: 'rel-1',
        })).toEqual({
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: {
                actId: 'act-1',
                mode: 'relation',
                participantKey: null,
                relationId: 'rel-1',
            },
        })
    })

    it('creates and resets act editor state consistently', () => {
        expect(createActEditorState('act-1', 'participant', { participantKey: 'alpha' })).toEqual({
            actId: 'act-1',
            mode: 'participant',
            participantKey: 'alpha',
            relationId: null,
        })

        expect(resolveActEditorStateAfterRelationRemoval(
            createActEditorState('act-1', 'participant', { participantKey: 'alpha' }),
            'act-1',
            'rel-1',
            {},
        )).toEqual(createActEditorState('act-1', 'act'))

        expect(resolveActEditorStateAfterRelationRemoval(
            createActEditorState('act-1', 'relation', { relationId: 'rel-1' }),
            'act-1',
            'rel-1',
            { alpha: {} },
        )).toEqual(createActEditorState('act-1', 'act'))

        expect(resolveActEditorStateAfterRelationRemoval(
            createActEditorState('act-1', 'relation', { relationId: 'rel-2' }),
            'act-1',
            'rel-1',
            { alpha: {} },
        )).toEqual(createActEditorState('act-1', 'relation', { relationId: 'rel-2' }))
    })

    it('builds select-act state with preferred thread and preserved participant', () => {
        const state = {
            selectedActId: 'act-1',
            selectedPerformerId: 'performer-1',
            selectedPerformerSessionId: 'session-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            focusSnapshot: { nodeId: 'act-1', type: 'act' },
            actEditorState: { actId: 'act-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            actThreads: {
                'act-1': [
                    { id: 'thread-1', createdAt: 1 },
                    { id: 'thread-2', createdAt: 2 },
                ],
            },
            acts: [act],
        } as unknown as StudioState

        expect(buildSelectActState(state, 'act-1')).toEqual({
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: { actId: 'act-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('preserves the participant when returning to an act with the same active thread', () => {
        const state = {
            selectedActId: null,
            selectedPerformerId: 'performer-1',
            selectedPerformerSessionId: 'session-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            focusSnapshot: { nodeId: 'performer-1', type: 'performer' },
            actEditorState: null,
            actThreads: {
                'act-1': [
                    { id: 'thread-1', createdAt: 1 },
                    { id: 'thread-2', createdAt: 2 },
                ],
            },
            acts: [act],
        } as unknown as StudioState

        expect(buildSelectActState(state, 'act-1')).toEqual({
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: null,
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('resolves selected-thread state only for the selected act', () => {
        const state = {
            selectedActId: 'act-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            acts: [act],
        } as unknown as StudioState

        expect(resolveSelectedActThreadState(state, 'act-1', [{ id: 'thread-2', createdAt: 2 }])).toEqual({
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })
        expect(resolveSelectedActThreadState(state, 'act-2', [{ id: 'thread-9', createdAt: 9 }])).toEqual({
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('builds thread selection and deletion state consistently', () => {
        const state = {
            selectedActId: 'act-1',
            selectedPerformerId: 'performer-1',
            selectedPerformerSessionId: 'session-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            actEditorState: { actId: 'act-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            actThreads: {
                'act-1': [
                    { id: 'thread-1', createdAt: 1 },
                    { id: 'thread-2', createdAt: 2 },
                ],
            },
            acts: [act],
        } as unknown as StudioState

        expect(buildActThreadSelectionState(state, 'act-1', 'thread-2', 'alpha')).toEqual({
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: { actId: 'act-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })
        expect(buildDeletedActThreadState(state, 'act-1', 'thread-1')).toEqual({
            actThreads: {
                'act-1': [{ id: 'thread-2', createdAt: 2 }],
            },
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('preserves the current participant when selecting a thread without an explicit tab choice', () => {
        const state = {
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            actEditorState: null,
            acts: [act],
        } as unknown as StudioState

        expect(buildActThreadSelectionState(state, 'act-1', 'thread-2')).toEqual({
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: null,
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })

        expect(buildActThreadSelectionState(state, 'act-1', 'thread-2', null)).toEqual({
            selectedActId: 'act-1',
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: null,
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: null,
        })
    })

    it('collects act thread chat keys via parsed targets', () => {
        const state = {
            chatKeyToSession: {
                'act:act-1:thread:thread-1:participant:alpha': 'session-1',
                'act:act-1:thread:thread-2:participant:alpha': 'session-2',
                'act:act-2:thread:thread-1:participant:beta': 'session-3',
                'performer-1': 'session-4',
            },
        } as unknown as StudioState

        expect(listActThreadChatKeys(state, 'act-1', 'thread-1')).toEqual([
            'act:act-1:thread:thread-1:participant:alpha',
        ])
        expect(collectRemovedActParticipantChatKeys(
            state,
            'act-1',
            new Set(['thread-2']),
            { 'act:act-1:thread:thread-2:participant:alpha': 'session-2' },
        )).toEqual([
            'act:act-1:thread:thread-1:participant:alpha',
        ])
    })
})
