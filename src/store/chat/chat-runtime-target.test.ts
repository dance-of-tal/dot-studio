import { describe, expect, it } from 'vitest'

import { createPerformerNode } from '../../lib/performers-node'
import { buildAssistantStageContext } from './chat-runtime-target'

describe('chat-runtime-target', () => {
    it('includes act rules and participant subscriptions in assistant stage context', () => {
        const researcher = createPerformerNode({
            id: 'performer-researcher',
            name: 'Researcher',
            x: 0,
            y: 0,
        })
        const writer = createPerformerNode({
            id: 'performer-writer',
            name: 'Writer',
            x: 0,
            y: 0,
        })

        const context = buildAssistantStageContext((() => ({
            workingDir: '/tmp/workspace',
            performers: [researcher, writer],
            acts: [
                {
                    id: 'act-1',
                    name: 'Research Flow',
                    description: 'Research then draft.',
                    actRules: ['Escalate blockers quickly.'],
                    position: { x: 0, y: 0 },
                    width: 400,
                    height: 300,
                    createdAt: Date.now(),
                    participants: {
                        'participant-researcher': {
                            performerRef: { kind: 'draft', draftId: 'performer-researcher' },
                            displayName: 'Lead Researcher',
                            subscriptions: {
                                messageTags: ['handoff'],
                                callboardKeys: ['brief'],
                                eventTypes: ['runtime.idle'],
                            },
                            position: { x: 0, y: 0 },
                        },
                        'participant-writer': {
                            performerRef: { kind: 'draft', draftId: 'performer-writer' },
                            displayName: 'Writer',
                            subscriptions: {
                                messagesFrom: ['participant-researcher'],
                            },
                            position: { x: 100, y: 0 },
                        },
                    },
                    relations: [
                        {
                            id: 'rel-1',
                            between: ['participant-researcher', 'participant-writer'],
                            direction: 'one-way',
                            name: 'handoff',
                            description: 'Researcher hands off notes to Writer.',
                        },
                    ],
                },
            ],
            drafts: {},
            assistantAvailableModels: [],
        })) as never)

        expect(context?.acts[0].description).toBe('Research then draft.')
        expect(context?.acts[0].actRules).toEqual(['Escalate blockers quickly.'])
        expect(context?.acts[0].participants[0].displayName).toBe('Lead Researcher')
        expect(context?.acts[0].participants[0].subscriptions).toEqual({
            messageTags: ['handoff'],
            callboardKeys: ['brief'],
            eventTypes: ['runtime.idle'],
        })
        expect(context?.acts[0].participants[1].subscriptions).toEqual({
            messagesFrom: ['participant-researcher'],
        })
    })

    it('excludes unsaved markdown drafts from assistant stage context', () => {
        const context = buildAssistantStageContext((() => ({
            workingDir: '/tmp/workspace',
            performers: [],
            acts: [],
            drafts: {
                'dance-saved': {
                    id: 'dance-saved',
                    kind: 'dance',
                    name: 'Saved Skill',
                    content: '---\nname: saved-skill\n---',
                    updatedAt: Date.now(),
                    saveState: 'saved',
                },
                'dance-unsaved': {
                    id: 'dance-unsaved',
                    kind: 'dance',
                    name: 'Unsaved Skill',
                    content: '---\nname: unsaved-skill\n---',
                    updatedAt: Date.now(),
                    saveState: 'unsaved',
                },
                'tal-unsaved': {
                    id: 'tal-unsaved',
                    kind: 'tal',
                    name: 'Unsaved Tal',
                    content: '# Tal',
                    updatedAt: Date.now(),
                    saveState: 'unsaved',
                },
            },
            assistantAvailableModels: [],
        })) as never)

        expect(context?.drafts).toEqual([
            {
                id: 'dance-saved',
                kind: 'dance',
                name: 'Saved Skill',
                description: undefined,
                tags: undefined,
            },
        ])
    })
})
