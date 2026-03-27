import { describe, expect, it } from 'vitest'
import type { ActDefinition, MailboxEvent } from '../../shared/act-types.js'
import { Mailbox } from '../../server/services/act-runtime/mailbox.js'
import { routeEvent } from '../../server/services/act-runtime/event-router.js'

const actDefinition: ActDefinition = {
    id: 'act-routing',
    name: 'Routing Team',
    participants: {
        CEO: {
            performerRef: { kind: 'draft', draftId: 'ceo' },
        },
        Merchandiser: {
            performerRef: { kind: 'draft', draftId: 'md' },
            subscriptions: {
                messagesFrom: ['CEO'],
            },
        },
        GrowthMarketer: {
            performerRef: { kind: 'draft', draftId: 'gm' },
            subscriptions: {
                messagesFrom: ['CEO'],
            },
        },
    },
    relations: [
        {
            id: 'rel-ceo-md',
            between: ['CEO', 'Merchandiser'],
            direction: 'both',
            name: 'CEO-MD',
            description: 'CEO works with merchandiser.',
        },
        {
            id: 'rel-ceo-gm',
            between: ['CEO', 'GrowthMarketer'],
            direction: 'both',
            name: 'CEO-GM',
            description: 'CEO works with growth marketer.',
        },
    ],
}

describe('act event routing', () => {
    it('wakes only the direct recipient for direct messages', () => {
        const event: MailboxEvent = {
            id: 'evt-1',
            type: 'message.sent',
            sourceType: 'performer',
            source: 'CEO',
            timestamp: Date.now(),
            payload: {
                from: 'CEO',
                to: 'GrowthMarketer',
                threadId: 'thread-1',
            },
        }

        const targets = routeEvent(event, actDefinition, new Mailbox(), [])

        expect(targets.map((target) => target.participantKey)).toEqual(['GrowthMarketer'])
    })

    it('still allows subscriptions to filter direct messages received by the participant', () => {
        const event: MailboxEvent = {
            id: 'evt-2',
            type: 'message.sent',
            sourceType: 'performer',
            source: 'CEO',
            timestamp: Date.now(),
            payload: {
                from: 'CEO',
                to: 'Merchandiser',
                threadId: 'thread-1',
            },
        }

        const targets = routeEvent(event, actDefinition, new Mailbox(), [])

        expect(targets.map((target) => target.participantKey)).toEqual(['Merchandiser'])
    })
})
