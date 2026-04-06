import { describe, it, expect } from 'vitest'
import {
    buildDraftDeleteCascade,
    buildInstalledDeleteCascade,
    buildAssetDeleteCascade,
    buildPerformerDeleteCascade,
} from './cascade-cleanup'
import type { PerformerNode, WorkspaceAct } from '../types'

function makePerformer(overrides: Partial<PerformerNode> & { id: string }): PerformerNode {
    return {
        name: overrides.id,
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
        ...overrides,
    }
}

function makeAct(overrides: Partial<WorkspaceAct> & { id: string }): WorkspaceAct {
    return {
        name: overrides.id,
        position: { x: 0, y: 0 },
        width: 400,
        height: 420,
        participants: {},
        relations: [],
        createdAt: Date.now(),
        ...overrides,
    }
}

// ── Draft cascade (via buildDraftDeleteCascade wrapper) ─────────

describe('buildDraftDeleteCascade', () => {
    it('returns empty patch when kind is "act"', () => {
        expect(buildDraftDeleteCascade('act', 'draft-1', [], [])).toEqual({})
    })

    it('nullifies performer talRef matching deleted tal draft', () => {
        const performers = [
            makePerformer({ id: 'p1', talRef: { kind: 'draft', draftId: 'tal-1' } }),
            makePerformer({ id: 'p2', talRef: { kind: 'registry', urn: 'tal/@acme/foo' } }),
            makePerformer({ id: 'p3', talRef: { kind: 'draft', draftId: 'tal-2' } }),
        ]
        const result = buildDraftDeleteCascade('tal', 'tal-1', performers, [])
        expect(result.performers).toHaveLength(3)
        expect(result.performers![0].talRef).toBeNull()
        expect(result.performers![1].talRef).toEqual({ kind: 'registry', urn: 'tal/@acme/foo' })
        expect(result.performers![2].talRef).toEqual({ kind: 'draft', draftId: 'tal-2' })
        expect(result.workspaceDirty).toBe(true)
    })

    it('returns empty patch when no tal matches', () => {
        const performers = [
            makePerformer({ id: 'p1', talRef: { kind: 'draft', draftId: 'other' } }),
        ]
        expect(buildDraftDeleteCascade('tal', 'no-match', performers, [])).toEqual({})
    })

    it('removes matching dance draft from performer danceRefs', () => {
        const performers = [
            makePerformer({
                id: 'p1',
                danceRefs: [
                    { kind: 'draft', draftId: 'd1' },
                    { kind: 'registry', urn: 'dance/@acme/bar' },
                    { kind: 'draft', draftId: 'd2' },
                ],
            }),
        ]
        const result = buildDraftDeleteCascade('dance', 'd1', performers, [])
        expect(result.performers![0].danceRefs).toEqual([
            { kind: 'registry', urn: 'dance/@acme/bar' },
            { kind: 'draft', draftId: 'd2' },
        ])
        expect(result.workspaceDirty).toBe(true)
    })

    it('returns empty patch when no dance matches', () => {
        const performers = [
            makePerformer({
                id: 'p1',
                danceRefs: [{ kind: 'draft', draftId: 'other' }],
            }),
        ]
        expect(buildDraftDeleteCascade('dance', 'no-match', performers, [])).toEqual({})
    })

    it('removes act participants and relations for deleted performer draft', () => {
        const acts = [
            makeAct({
                id: 'act-1',
                participants: {
                    k1: { performerRef: { kind: 'draft', draftId: 'perf-draft-1' }, position: { x: 0, y: 0 } },
                    k2: { performerRef: { kind: 'draft', draftId: 'perf-draft-2' }, position: { x: 100, y: 0 } },
                    k3: { performerRef: { kind: 'registry', urn: 'performer/@acme/x' }, position: { x: 200, y: 0 } },
                },
                relations: [
                    { id: 'r1', between: ['k1', 'k2'], direction: 'both' as const, name: 'handoff', description: '' },
                    { id: 'r2', between: ['k2', 'k3'], direction: 'both' as const, name: 'review', description: '' },
                ],
            }),
        ]
        const result = buildDraftDeleteCascade('performer', 'perf-draft-1', [], acts)
        const updatedAct = result.acts![0]
        expect(Object.keys(updatedAct.participants)).toEqual(['k2', 'k3'])
        expect(updatedAct.relations).toHaveLength(1)
        expect(updatedAct.relations[0].id).toBe('r2')
        expect(result.workspaceDirty).toBe(true)
    })
})

// ── Installed (registry) cascade ─────────────────────────

describe('buildInstalledDeleteCascade', () => {
    it('nullifies performer talRef matching uninstalled tal URN', () => {
        const performers = [
            makePerformer({ id: 'p1', talRef: { kind: 'registry', urn: 'tal/@acme/foo' } }),
            makePerformer({ id: 'p2', talRef: { kind: 'draft', draftId: 'draft-1' } }),
            makePerformer({ id: 'p3', talRef: { kind: 'registry', urn: 'tal/@acme/bar' } }),
        ]
        const result = buildInstalledDeleteCascade('tal', 'tal/@acme/foo', performers, [])
        expect(result.performers![0].talRef).toBeNull()
        expect(result.performers![1].talRef).toEqual({ kind: 'draft', draftId: 'draft-1' })
        expect(result.performers![2].talRef).toEqual({ kind: 'registry', urn: 'tal/@acme/bar' })
        expect(result.workspaceDirty).toBe(true)
    })

    it('removes matching dance URN from performer danceRefs', () => {
        const performers = [
            makePerformer({
                id: 'p1',
                danceRefs: [
                    { kind: 'registry', urn: 'dance/@acme/x' },
                    { kind: 'draft', draftId: 'd1' },
                    { kind: 'registry', urn: 'dance/@acme/y' },
                ],
            }),
        ]
        const result = buildInstalledDeleteCascade('dance', 'dance/@acme/x', performers, [])
        expect(result.performers![0].danceRefs).toEqual([
            { kind: 'draft', draftId: 'd1' },
            { kind: 'registry', urn: 'dance/@acme/y' },
        ])
    })

    it('removes act participants for uninstalled performer URN', () => {
        const acts = [
            makeAct({
                id: 'act-1',
                participants: {
                    k1: { performerRef: { kind: 'registry', urn: 'performer/@acme/agent' }, position: { x: 0, y: 0 } },
                    k2: { performerRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
                },
                relations: [
                    { id: 'r1', between: ['k1', 'k2'], direction: 'both' as const, name: 'handoff', description: '' },
                ],
            }),
        ]
        const result = buildInstalledDeleteCascade('performer', 'performer/@acme/agent', [], acts)
        expect(Object.keys(result.acts![0].participants)).toEqual(['k2'])
        expect(result.acts![0].relations).toHaveLength(0)
    })

    it('returns empty patch when no matches', () => {
        const performers = [
            makePerformer({ id: 'p1', talRef: { kind: 'registry', urn: 'tal/@acme/other' } }),
        ]
        expect(buildInstalledDeleteCascade('tal', 'tal/@acme/nope', performers, [])).toEqual({})
    })
})

// ── Unified buildAssetDeleteCascade ─────────────────────

describe('buildAssetDeleteCascade', () => {
    it('delegates draft target correctly', () => {
        const performers = [
            makePerformer({ id: 'p1', talRef: { kind: 'draft', draftId: 'my-tal' } }),
        ]
        const result = buildAssetDeleteCascade('tal', { kind: 'draft', draftId: 'my-tal' }, performers, [])
        expect(result.performers![0].talRef).toBeNull()
    })

    it('delegates registry target correctly', () => {
        const performers = [
            makePerformer({ id: 'p1', talRef: { kind: 'registry', urn: 'tal/@x/y' } }),
        ]
        const result = buildAssetDeleteCascade('tal', { kind: 'registry', urn: 'tal/@x/y' }, performers, [])
        expect(result.performers![0].talRef).toBeNull()
    })
})

// ── Canvas performer delete ──────────────────────────────

describe('buildPerformerDeleteCascade', () => {
    it('removes act participants referencing deleted performer.id', () => {
        const acts = [
            makeAct({
                id: 'act-1',
                participants: {
                    k1: { performerRef: { kind: 'draft', draftId: 'performer-1' }, position: { x: 0, y: 0 } },
                    k2: { performerRef: { kind: 'draft', draftId: 'performer-2' }, position: { x: 100, y: 0 } },
                },
                relations: [
                    { id: 'r1', between: ['k1', 'k2'], direction: 'both' as const, name: 'handoff', description: '' },
                ],
            }),
        ]
        const result = buildPerformerDeleteCascade({ id: 'performer-1' }, acts)
        expect(Object.keys(result.acts![0].participants)).toEqual(['k2'])
        expect(result.acts![0].relations).toHaveLength(0)
    })

    it('returns empty patch when no act references the performer', () => {
        const acts = [
            makeAct({
                id: 'act-1',
                participants: {
                    k1: { performerRef: { kind: 'draft', draftId: 'other' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
        ]
        expect(buildPerformerDeleteCascade({ id: 'no-match' }, acts)).toEqual({})
    })

    it('preserves acts that have no matching participants (same reference)', () => {
        const acts = [
            makeAct({
                id: 'act-1',
                participants: {
                    k1: { performerRef: { kind: 'registry', urn: 'performer/@acme/x' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
            makeAct({
                id: 'act-2',
                participants: {
                    k1: { performerRef: { kind: 'draft', draftId: 'performer-1' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
        ]
        const result = buildPerformerDeleteCascade({ id: 'performer-1' }, acts)
        expect(result.acts![0]).toBe(acts[0])
        expect(Object.keys(result.acts![1].participants)).toEqual([])
    })

    it('removes act participants referencing a linked draft id for the deleted performer', () => {
        const acts = [
            makeAct({
                id: 'act-1',
                participants: {
                    k1: { performerRef: { kind: 'draft', draftId: 'performer-draft-1' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
        ]
        const result = buildPerformerDeleteCascade({
            id: 'performer-1',
            meta: { derivedFrom: 'draft:performer-draft-1' },
        }, acts)
        expect(Object.keys(result.acts![0].participants)).toEqual([])
    })
})
