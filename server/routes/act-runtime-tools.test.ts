import { describe, expect, it } from 'vitest'
import type { ActDefinition } from '../../shared/act-types.js'
import { resolveParticipantRecipient } from './act-runtime-tools.js'

const actDefinition: ActDefinition = {
    id: 'act-review',
    name: 'Review Team',
    participants: {
        'participant-lead': {
            performerRef: { kind: 'draft', draftId: 'lead-performer' },
            displayName: 'participant_1',
        },
        'participant-data': {
            performerRef: { kind: 'draft', draftId: 'data-performer' },
            displayName: 'participant_2',
        },
        'participant-bull': {
            performerRef: { kind: 'draft', draftId: 'bull-performer' },
            displayName: 'participant_3',
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['participant-lead', 'participant-data'],
            direction: 'one-way',
            name: 'participant_1_to_participant_2',
            description: 'Request evidence packs.',
        },
        {
            id: 'rel-2',
            between: ['participant-lead', 'participant-bull'],
            direction: 'one-way',
            name: 'participant_1_to_participant_3',
            description: 'Request bull thesis.',
        },
    ],
}

describe('resolveParticipantRecipient', () => {
    it('resolves display names and participant keys directly', () => {
        expect(resolveParticipantRecipient(actDefinition, 'participant-lead', 'participant_2')).toBe('participant-data')
        expect(resolveParticipantRecipient(actDefinition, 'participant-lead', 'participant-bull')).toBe('participant-bull')
    })

    it('does not resolve relation names or unknown recipients', () => {
        expect(resolveParticipantRecipient(
            actDefinition,
            'participant-lead',
            'participant_1_to_participant_2',
        )).toBeNull()
        expect(resolveParticipantRecipient(
            actDefinition,
            'participant-data',
            'participant_1_to_participant_3',
        )).toBeNull()
        expect(resolveParticipantRecipient(actDefinition, 'participant-lead', 'UnknownTeammate')).toBeNull()
    })

    it('does not resolve recipients that are only connected by an incoming one-way relation', () => {
        expect(resolveParticipantRecipient(actDefinition, 'participant-data', 'participant_1')).toBeNull()
        expect(resolveParticipantRecipient(actDefinition, 'participant-data', 'participant-lead')).toBeNull()
        expect(resolveParticipantRecipient(
            actDefinition,
            'participant-data',
            'participant_1_to_participant_2',
        )).toBeNull()
    })
})
