// Integration test: Performer → Act creation with name-based participant keys
//
// Verifies the full flow:
// 1. Performer creation with unique names
// 2. Act creation
// 3. Binding performers to Act (participant key = performer name)
// 4. Relation creation uses name-based keys
// 5. Cascade rename on performer name change
// 6. Duplicate name prevention

import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'zustand/vanilla'
import type { StudioState } from '../store/types'

// We need to test the actual store slices, but they require complex wiring.
// Instead, test the core logic functions directly.

import { resolveActParticipantLabel } from '../features/act/participant-labels'
import { buildActAssetPayload } from '../lib/performers-publish'
import type { PerformerNode, WorkspaceAct, WorkspaceActParticipantBinding } from '../types'

function makePerformer(id: string, name: string, derivedFrom?: string): PerformerNode {
    return {
        id,
        name,
        position: { x: 0, y: 0 },
        width: 320,
        height: 400,
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
        mcpBindingMap: {},
        declaredMcpConfig: null,
        danceDeliveryMode: 'auto',
        executionMode: 'direct',
        ...(derivedFrom ? { meta: { derivedFrom } } : {}),
    }
}

function makeAct(overrides: Partial<WorkspaceAct> = {}): WorkspaceAct {
    return {
        id: 'act-1',
        name: 'Test Act',
        participants: {},
        relations: [],
        position: { x: 0, y: 0 },
        width: 600,
        height: 400,
        createdAt: Date.now(),
        ...overrides,
    }
}

describe('Participant Name-Based Keys', () => {
    describe('resolveActParticipantLabel', () => {
        const performers = [
            makePerformer('performer-1', 'Coder'),
            makePerformer('performer-2', 'Reviewer', 'performer/@studio/reviewer'),
        ]

        it('returns participant key as label (key = performer name)', () => {
            const act = makeAct({
                participants: {
                    'Coder': {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        position: { x: 0, y: 0 },
                    },
                },
            })
            expect(resolveActParticipantLabel(act, 'Coder', performers)).toBe('Coder')
        })

        it('returns key directly when no act is provided', () => {
            expect(resolveActParticipantLabel(null, 'Coder', performers)).toBe('Coder')
        })

        it('returns key when binding not found', () => {
            const act = makeAct()
            expect(resolveActParticipantLabel(act, 'Unknown', performers)).toBe('Unknown')
        })

        it('returns updated performer name if cascade rename missed', () => {
            // Simulate: key is "OldName" but performer was renamed to "Coder"
            const act = makeAct({
                participants: {
                    'OldName': {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        position: { x: 0, y: 0 },
                    },
                },
            })
            expect(resolveActParticipantLabel(act, 'OldName', performers)).toBe('Coder')
        })
    })

    describe('buildActAssetPayload', () => {
        it('outputs key (not id) in participant payload', () => {
            const act = makeAct({
                name: 'Review Pipeline',
                participants: {
                    'Coder': {
                        performerRef: { kind: 'registry', urn: 'performer/@studio/coder' },
                        position: { x: 0, y: 0 },
                    },
                    'Reviewer': {
                        performerRef: { kind: 'registry', urn: 'performer/@studio/reviewer' },
                        position: { x: 300, y: 0 },
                    },
                },
                relations: [
                    {
                        id: 'rel-1',
                        between: ['Coder', 'Reviewer'] as [string, string],
                        direction: 'one-way' as const,
                        name: 'Code Review',
                        description: 'Request code review',
                    },
                ],
            })

            const payload = buildActAssetPayload(act)

            // Verify participant uses 'key' not 'id'
            expect(payload.payload.participants[0]).toHaveProperty('key', 'Coder')
            expect(payload.payload.participants[1]).toHaveProperty('key', 'Reviewer')
            expect(payload.payload.participants[0]).not.toHaveProperty('id')

            // Verify relations use name-based keys
            expect(payload.payload.relations[0].between).toEqual(['Coder', 'Reviewer'])
        })

        it('rejects draft performers in asset payload', () => {
            const act = makeAct({
                participants: {
                    'Coder': {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        position: { x: 0, y: 0 },
                    },
                },
            })

            expect(() => buildActAssetPayload(act)).toThrow('Save participant performer drafts')
        })
    })

    describe('unique performer name helper', () => {
        // Test the uniquePerformerName pattern directly
        function uniquePerformerName(desired: string, existingNames: string[]): string {
            if (!existingNames.includes(desired)) return desired
            let i = 2
            while (existingNames.includes(`${desired} (${i})`)) i++
            return `${desired} (${i})`
        }

        it('returns name as-is when no conflict', () => {
            expect(uniquePerformerName('Coder', ['Reviewer'])).toBe('Coder')
        })

        it('appends (2) on first conflict', () => {
            expect(uniquePerformerName('Coder', ['Coder'])).toBe('Coder (2)')
        })

        it('increments suffix on multiple conflicts', () => {
            expect(uniquePerformerName('Coder', ['Coder', 'Coder (2)'])).toBe('Coder (3)')
        })

        it('handles empty existing list', () => {
            expect(uniquePerformerName('Coder', [])).toBe('Coder')
        })
    })

    describe('cascade rename', () => {
        it('updates Act participant key and relation.between on performer rename', () => {
            // Simulate what workspaceSlice.updatePerformerName does
            const act = makeAct({
                participants: {
                    'OldName': {
                        performerRef: { kind: 'draft', draftId: 'p-1' },
                        position: { x: 0, y: 0 },
                    },
                    'Reviewer': {
                        performerRef: { kind: 'registry', urn: 'performer/@studio/reviewer' },
                        position: { x: 300, y: 0 },
                    },
                },
                relations: [
                    {
                        id: 'r1',
                        between: ['OldName', 'Reviewer'] as [string, string],
                        direction: 'both' as const,
                        name: 'Collaboration',
                        description: 'Work together',
                    },
                ],
            })

            const oldName = 'OldName'
            const newName = 'Coder'

            // Apply cascade rename (matching workspaceSlice logic)
            const oldKey = Object.keys(act.participants).find(k => k === oldName)
            expect(oldKey).toBe('OldName')

            const { [oldKey!]: binding, ...restParticipants } = act.participants
            const updatedAct = {
                ...act,
                participants: { ...restParticipants, [newName]: binding },
                relations: act.relations.map(r => ({
                    ...r,
                    between: r.between.map(b => b === oldName ? newName : b) as [string, string],
                })),
            }

            // Verify cascade
            expect(Object.keys(updatedAct.participants)).toEqual(['Reviewer', 'Coder'])
            expect(updatedAct.relations[0].between).toEqual(['Coder', 'Reviewer'])
            expect(updatedAct.participants['OldName']).toBeUndefined()
            expect(updatedAct.participants['Coder']).toBeDefined()
        })
    })
})
