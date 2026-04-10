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
            displayName: 'Chief Exec',
        },
        Merchandiser: {
            performerRef: { kind: 'draft', draftId: 'md' },
            displayName: 'Merchandiser',
            subscriptions: {
                messagesFrom: ['CEO'],
            },
        },
        GrowthMarketer: {
            performerRef: { kind: 'draft', draftId: 'gm' },
            displayName: 'Growth Marketer',
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

    it('keeps the wait condition wake when the same event also matches a subscription', () => {
        const mailbox = new Mailbox()
        mailbox.addWakeCondition({
            target: 'self',
            createdBy: 'GrowthMarketer',
            onSatisfiedMessage: 'Summarize the new ask and reply.',
            condition: {
                type: 'message_received',
                from: 'Chief Exec',
            },
        })

        const event: MailboxEvent = {
            id: 'evt-3',
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

        const targets = routeEvent(event, actDefinition, mailbox, [event])

        expect(targets).toHaveLength(1)
        expect(targets[0]).toEqual(expect.objectContaining({
            participantKey: 'GrowthMarketer',
            reason: 'wake-condition',
            wakeCondition: expect.objectContaining({
                onSatisfiedMessage: 'Summarize the new ask and reply.',
                status: 'triggered',
            }),
        }))
    })
})
