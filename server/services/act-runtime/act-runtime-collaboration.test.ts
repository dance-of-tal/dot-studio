import { describe, expect, it } from 'vitest'
import type { ActDefinition, MailboxEvent } from '../../../shared/act-types.js'
import { parseActSessionOwnerId } from '../../lib/session-execution.js'
import { buildActContext } from './act-context-builder.js'
import { getStaticActTools } from './act-tools.js'
import { Mailbox } from './mailbox.js'
import type { WakeUpTarget } from './event-router.js'
import { buildWakePrompt, resolveWakePrompt } from './wake-prompt-builder.js'

const actDefinition: ActDefinition = {
    id: 'act-review',
    name: 'Review Team',
    description: 'Ship the final review with clear handoffs.',
    actRules: ['Keep updates concise.', 'Escalate blockers quickly.'],
    participants: {
        Lead: {
            performerRef: { kind: 'draft', draftId: 'lead-performer' },
            subscriptions: {
                messagesFrom: ['Researcher'],
                messageTags: ['lead-alert'],
                callboardKeys: ['lead/private'],
                eventTypes: ['runtime.idle'],
            },
        },
        Researcher: {
            performerRef: { kind: 'draft', draftId: 'researcher-performer' },
            subscriptions: {
                messageTags: ['handoff', 'clarification'],
                callboardKeys: ['review-*'],
            },
        },
        Observer: {
            performerRef: { kind: 'draft', draftId: 'observer-performer' },
            subscriptions: {
                messageTags: ['observer-tag'],
                callboardKeys: ['observer/*'],
                eventTypes: ['runtime.idle'],
            },
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['Lead', 'Researcher'],
            direction: 'both',
            name: 'Review Loop',
            description: 'Exchange findings and approvals.',
        },
    ],
}

describe('collaboration context rewrite', () => {
    it('builds stable collaboration context without model-facing IDs', () => {
        const context = buildActContext(actDefinition, 'Lead')

        expect(context).toContain('# Collaboration Context')
        expect(context).toContain('Team: Review Team')
        expect(context).toContain('Your role: Lead')
        expect(context).toContain('message_teammate')
        expect(context).toContain('Do not pass relation names like `participant_1_to_participant_2`.')
        expect(context).toContain('# Valid Teammates')
        expect(context).toContain('Use these names as `recipient` values: Researcher')
        expect(context).not.toContain('Observer')
        expect(context).toContain('update_shared_board')
        expect(context).toContain('short Markdown summaries')
        expect(context).toContain('Do not use the shared board as the storage location for full deliverables.')
        expect(context).toContain('# Coordination Signals')
        expect(context).toContain('Message tags for Researcher: handoff, clarification')
        expect(context).toContain('Shared note keys for Researcher: review-*')
        expect(context.indexOf('# Direct Connections')).toBeLessThan(context.indexOf('# Coordination Signals'))
        expect(context).toContain('check only the sender or shared note key relevant to the current event')
        expect(context).toContain('instead of polling the full shared board')
        expect(context).not.toContain('# Notifications You Receive')
        expect(context).not.toContain('lead-alert')
        expect(context).not.toContain('lead/private')
        expect(context).not.toContain('observer-tag')
        expect(context).not.toContain('observer/*')
        expect(context).not.toContain('runtime.idle')
        expect(context).not.toContain('System updates:')
        expect(context).not.toContain('Act ID')
        expect(context).not.toContain('Thread ID')
        expect(context).not.toContain('participant key')
        expect(context).not.toContain('act_send_message')
    })

    it('lists only outbound or bidirectional teammates as valid message recipients', () => {
        const oneWayActDefinition: ActDefinition = {
            id: 'act-one-way',
            name: 'One Way Team',
            participants: {
                Lead: {
                    performerRef: { kind: 'draft', draftId: 'lead-performer' },
                },
                Researcher: {
                    performerRef: { kind: 'draft', draftId: 'researcher-performer' },
                },
            },
            relations: [
                {
                    id: 'rel-1',
                    between: ['Lead', 'Researcher'],
                    direction: 'one-way',
                    name: 'Lead Delegates',
                    description: 'Lead can delegate work to Researcher.',
                },
            ],
        }

        const researcherContext = buildActContext(oneWayActDefinition, 'Researcher')

        expect(researcherContext).toContain('# Direct Connections')
        expect(researcherContext).toContain('Researcher ← Lead')
        expect(researcherContext).not.toContain('# Valid Teammates')

        const leadContext = buildActContext(oneWayActDefinition, 'Lead')
        expect(leadContext).toContain('# Valid Teammates')
        expect(leadContext).toContain('Use these names as `recipient` values: Researcher')
    })

    it('builds wake prompts from transient updates only', () => {
        const mailbox = new Mailbox()
        mailbox.addMessage({
            from: 'Researcher',
            to: 'Lead',
            content: 'I uploaded the review summary.',
            tag: 'handoff',
            threadId: 'thread-1',
        })

        const event: MailboxEvent = {
            id: 'evt-1',
            type: 'message.sent',
            sourceType: 'performer',
            source: 'Researcher',
            timestamp: Date.now(),
            payload: {
                from: 'Researcher',
                to: 'Lead',
                tag: 'handoff',
                threadId: 'thread-1',
            },
        }
        const target: WakeUpTarget = {
            participantKey: 'Lead',
            triggerEvent: event,
            reason: 'subscription',
        }

        const prompt = buildWakePrompt(target, mailbox)

        expect(prompt).toContain('[Direct Message]')
        expect(prompt).toContain('From: Researcher [handoff]')
        expect(prompt).toContain('I uploaded the review summary.')
        expect(prompt).not.toContain('sent you a direct message')
        expect(prompt).not.toContain('Pending Direct Messages')
        expect(prompt).not.toContain('# Collaboration Context')
        expect(prompt).not.toContain('Team: Review Team')
        expect(prompt).not.toContain('message_teammate')
        expect(prompt).not.toContain('relevant to the current event')
        expect(prompt).not.toContain('save a self-wake with `wait_until`')
    })

    it('separates wake cause from delivered message content', () => {
        const mailbox = new Mailbox()
        mailbox.addMessage({
            from: 'Researcher',
            to: 'Lead',
            content: 'Review summary is ready.',
            tag: 'handoff',
            threadId: 'thread-1',
        })

        const target: WakeUpTarget = {
            participantKey: 'Lead',
            triggerEvent: {
                id: 'evt-2',
                type: 'message.sent',
                sourceType: 'performer',
                source: 'Researcher',
                timestamp: Date.now(),
                payload: {
                    from: 'Researcher',
                    to: 'Lead',
                    tag: 'handoff',
                    threadId: 'thread-1',
                },
            },
            reason: 'subscription',
        }

        expect(resolveWakePrompt(target, mailbox)).toEqual({
            cause: 'subscription',
            trigger: {
                kind: 'direct-message',
                source: 'Researcher',
                tag: 'handoff',
            },
            deliveries: {
                messages: [
                    {
                        from: 'Researcher',
                        tag: 'handoff',
                        content: 'Review summary is ready.',
                    },
                ],
            },
        })
    })

    it('generates session-bound collaboration tools', () => {
        const tools = getStaticActTools('/tmp/workspace')
        const messageTool = tools.find((tool) => tool.name === 'message_teammate')
        const boardTool = tools.find((tool) => tool.name === 'update_shared_board')
        const readTool = tools.find((tool) => tool.name === 'read_shared_board')
        const waitTool = tools.find((tool) => tool.name === 'wait_until')

        expect(messageTool?.content).toContain('async execute(args, context)')
        expect(messageTool?.content).toContain('/api/act/session/${encodeURIComponent(sessionID)}/message-teammate')
        expect(messageTool?.content).toContain('Pass the teammate display name as recipient')
        expect(boardTool?.content).toContain('/api/act/session/${encodeURIComponent(sessionID)}/update-shared-board')
        expect(boardTool?.content).toContain('Prefer short Markdown summaries')
        expect(boardTool?.content).toContain('Do not paste full deliverables')
        expect(readTool?.content).toContain('/api/act/session/${encodeURIComponent(sessionID)}/read-shared-board')
        expect(waitTool?.content).toContain('/api/act/session/${encodeURIComponent(sessionID)}/wait-until')
        expect(messageTool?.content).not.toContain('const actId =')
        expect(messageTool?.content).not.toContain('const threadId =')
    })

    it('parses act participant owner IDs from session context', () => {
        expect(parseActSessionOwnerId('act:act-review:thread:thread-1:participant:Lead')).toEqual({
            actId: 'act-review',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })
        expect(parseActSessionOwnerId('performer:solo')).toBeNull()
    })
})
