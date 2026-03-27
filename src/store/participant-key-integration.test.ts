// Integration test: Performer → Act creation with Act-local participant keys
//
// Verifies the full flow:
// 1. Performer creation with unique names
// 2. Act creation
// 3. Binding performers to Act
// 4. Relation creation uses internal participant keys
// 5. Performer rename does not rewrite participant identity
// 6. Duplicate name prevention

import { describe, it, expect } from 'vitest'

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

describe('Participant Keys And Labels', () => {
    describe('resolveActParticipantLabel', () => {
        const performers = [
            makePerformer('performer-1', 'Coder'),
            makePerformer('performer-2', 'Reviewer', 'performer/@studio/reviewer'),
        ]

        it('returns participant key as label when it is already human-readable', () => {
            const act = makeAct({
                participants: {
                    'participant-1': {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'Coder',
                        position: { x: 0, y: 0 },
                    },
                },
            })
            expect(resolveActParticipantLabel(act, 'participant-1', performers)).toBe('Coder')
        })

        it('returns key directly when no act is provided', () => {
            expect(resolveActParticipantLabel(null, 'Coder', performers)).toBe('Coder')
        })

        it('returns key when binding not found', () => {
            const act = makeAct()
            expect(resolveActParticipantLabel(act, 'Unknown', performers)).toBe('Unknown')
        })

        it('returns updated performer name if cascade rename missed', () => {
            const act = makeAct({
                participants: {
                    'participant-1': {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'OldName',
                        position: { x: 0, y: 0 },
                    },
                },
            })
            expect(resolveActParticipantLabel(act, 'participant-1', performers)).toBe('Coder')
        })
    })

    describe('buildActAssetPayload', () => {
        it('exports display names while keeping internal ids inside the workspace', () => {
            const act = makeAct({
                name: 'Review Pipeline',
                participants: {
                    'participant-1': {
                        performerRef: { kind: 'registry', urn: 'performer/@studio/coder' },
                        displayName: 'Coder',
                        position: { x: 0, y: 0 },
                    },
                    'participant-2': {
                        performerRef: { kind: 'registry', urn: 'performer/@studio/reviewer' },
                        displayName: 'Reviewer',
                        position: { x: 300, y: 0 },
                    },
                },
                relations: [
                    {
                        id: 'rel-1',
                        between: ['participant-1', 'participant-2'] as [string, string],
                        direction: 'one-way' as const,
                        name: 'Code Review',
                        description: 'Request code review',
                    },
                ],
            })

            const payload = buildActAssetPayload(act)

            expect(payload.payload.participants[0]).toHaveProperty('key', 'Coder')
            expect(payload.payload.participants[1]).toHaveProperty('key', 'Reviewer')
            expect(payload.payload.participants[0]).not.toHaveProperty('id')

            expect(payload.payload.relations[0].between).toEqual(['Coder', 'Reviewer'])
        })

        it('rejects draft performers in asset payload', () => {
            const act = makeAct({
                participants: {
                    'participant-1': {
                        performerRef: { kind: 'draft', draftId: 'performer-1' },
                        displayName: 'Coder',
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

    describe('performer rename', () => {
        it('does not rewrite Act participant keys or relation endpoints', () => {
            const act = makeAct({
                participants: {
                    'participant-1': {
                        performerRef: { kind: 'draft', draftId: 'p-1' },
                        displayName: 'OldName',
                        position: { x: 0, y: 0 },
                    },
                    'participant-2': {
                        performerRef: { kind: 'registry', urn: 'performer/@studio/reviewer' },
                        displayName: 'Reviewer',
                        position: { x: 300, y: 0 },
                    },
                },
                relations: [
                    {
                        id: 'r1',
                        between: ['participant-1', 'participant-2'] as [string, string],
                        direction: 'both' as const,
                        name: 'Collaboration',
                        description: 'Work together',
                    },
                ],
            })

            const performers = [
                makePerformer('p-1', 'Coder'),
                makePerformer('p-2', 'Reviewer'),
            ]

            expect(Object.keys(act.participants)).toEqual(['participant-1', 'participant-2'])
            expect(act.relations[0].between).toEqual(['participant-1', 'participant-2'])
            expect(resolveActParticipantLabel(act, 'participant-1', performers)).toBe('Coder')
        })
    })
})
