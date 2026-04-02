import { describe, expect, it } from 'vitest'
import type { ActDefinition, MailboxEvent } from '../../shared/act-types.js'
import { parseActSessionOwnerId } from '../../server/lib/session-execution.js'
import { buildActContext } from '../../server/services/act-runtime/act-context-builder.js'
import { getStaticActTools } from '../../server/services/act-runtime/act-tools.js'
import { Mailbox } from '../../server/services/act-runtime/mailbox.js'
import type { WakeUpTarget } from '../../server/services/act-runtime/event-router.js'
import { buildWakePrompt } from '../../server/services/act-runtime/wake-prompt-builder.js'

const actDefinition: ActDefinition = {
    id: 'act-review',
    name: 'Review Team',
    description: 'Ship the final review with clear handoffs.',
    actRules: ['Keep updates concise.', 'Escalate blockers quickly.'],
    participants: {
        'participant-lead': {
            performerRef: { kind: 'draft', draftId: 'lead-performer' },
            displayName: 'Lead',
            description: 'Drive the final review and decide the next handoff.',
            subscriptions: {
                messagesFrom: ['participant-researcher'],
                messageTags: ['handoff'],
                callboardKeys: ['review-*'],
                eventTypes: ['runtime.idle'],
            },
        },
        'participant-researcher': {
            performerRef: { kind: 'draft', draftId: 'researcher-performer' },
            displayName: 'Researcher',
            description: 'Collect findings and hand off concise updates.',
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['participant-lead', 'participant-researcher'],
            direction: 'both',
            name: 'Review Loop',
            description: 'Exchange findings and approvals.',
        },
    ],
}

describe('act collaboration rewrite', () => {
    it('builds stable collaboration context without model-facing IDs', () => {
        const context = buildActContext(actDefinition, 'participant-lead')

        expect(context).toContain('# Collaboration Context')
        expect(context).toContain('Team: Review Team')
        expect(context).toContain('Your role: Lead')
        expect(context).toContain('Your focus: Drive the final review and decide the next handoff.')
        expect(context).toContain('# Direct Connections')
        expect(context).toContain('Researcher focus: Collect findings and hand off concise updates.')
        expect(context).toContain('message_teammate')
        expect(context).toContain('Do not pass relation names like `participant_1_to_participant_2`.')
        expect(context).toContain('# Valid Teammates')
        expect(context).toContain('Use these names as `recipient` values: Researcher')
        expect(context).toContain('update_shared_board')
        expect(context).toContain('short Markdown summaries')
        expect(context).toContain('Do not use the shared board as the storage location for full deliverables.')
        expect(context).toContain('Use `read_shared_board` for the relevant key you need.')
        expect(context).toContain('board_key_exists')
        expect(context).not.toContain('Act ID')
        expect(context).not.toContain('Thread ID')
        expect(context).not.toContain('participant key')
        expect(context).not.toContain('act_send_message')
        expect(context).not.toContain('- Team members:')
    })

    it('builds wake prompts from transient updates only', () => {
        const mailbox = new Mailbox()
        mailbox.addMessage({
            from: 'participant-researcher',
            to: 'participant-lead',
            content: 'I uploaded the review summary.',
            tag: 'handoff',
            threadId: 'thread-1',
        })

        const event: MailboxEvent = {
            id: 'evt-1',
            type: 'message.sent',
            sourceType: 'performer',
            source: 'participant-researcher',
            timestamp: Date.now(),
            payload: {
                from: 'participant-researcher',
                to: 'participant-lead',
                tag: 'handoff',
                threadId: 'thread-1',
            },
        }
        const target: WakeUpTarget = {
            participantKey: 'participant-lead',
            triggerEvent: event,
            reason: 'subscription',
        }

        const prompt = buildWakePrompt(target, mailbox, actDefinition)

        expect(prompt).toContain('[Direct Message]')
        expect(prompt).toContain('Researcher sent you a direct message. label: handoff')
        expect(prompt).toContain('Pending Direct Messages (1)')
        expect(prompt).toContain('Check only the sender or shared note key relevant to this event before acting.')
        expect(prompt).toContain('save a self-wake with `wait_until`')
        expect(prompt).not.toContain('# Collaboration Context')
        expect(prompt).not.toContain('Team: Review Team')
        expect(prompt).not.toContain('message_teammate')
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
        expect(readTool?.content).toContain('summary", "full')
        expect(waitTool?.content).toContain('/api/act/session/${encodeURIComponent(sessionID)}/wait-until')
        expect(waitTool?.content).toContain('board_key_exists')
        expect(messageTool?.content).not.toContain('const actId =')
        expect(messageTool?.content).not.toContain('const threadId =')
    })

    it('parses act participant owner IDs from session context', () => {
        expect(parseActSessionOwnerId('act:act-review:thread:thread-1:participant:participant-lead')).toEqual({
            actId: 'act-review',
            threadId: 'thread-1',
            participantKey: 'participant-lead',
        })
        expect(parseActSessionOwnerId('performer:solo')).toBeNull()
    })
})
