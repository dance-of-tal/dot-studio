import { describe, expect, it } from 'vitest'
import type { PerformerNode, WorkspaceActParticipantBinding } from '../types'
import {
    describeActParticipantRef,
    performerByDraftId,
    performerByRegistryUrn,
    resolvePerformerFromActBinding,
} from './act-participants'

const performers: PerformerNode[] = [
    {
        id: 'performer-1',
        name: 'Draft Performer',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
    },
    {
        id: 'performer-2',
        name: 'Registry Performer',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: [],
        meta: {
            derivedFrom: 'performer://registry',
        },
    },
]

describe('act participant helpers', () => {
    it('resolves draft and registry performers', () => {
        expect(performerByDraftId(performers, 'performer-1')?.name).toBe('Draft Performer')
        expect(performerByRegistryUrn(performers, 'performer://registry')?.name).toBe('Registry Performer')
    })

    it('resolves performer from a participant binding and describes the ref', () => {
        const draftBinding: WorkspaceActParticipantBinding = {
            performerRef: { kind: 'draft', draftId: 'performer-1' },
            position: { x: 0, y: 0 },
        }
        const registryBinding: WorkspaceActParticipantBinding = {
            performerRef: { kind: 'registry', urn: 'performer://registry' },
            position: { x: 10, y: 10 },
        }

        expect(resolvePerformerFromActBinding(performers, draftBinding)?.name).toBe('Draft Performer')
        expect(resolvePerformerFromActBinding(performers, registryBinding)?.name).toBe('Registry Performer')
        expect(describeActParticipantRef(draftBinding, 'fallback')).toBe('performer-1')
        expect(describeActParticipantRef(registryBinding, 'fallback')).toBe('performer://registry')
        expect(describeActParticipantRef(null, 'fallback')).toBe('fallback')
    })
})
