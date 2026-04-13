import { describe, expect, it } from 'vitest'

import {
    ASSISTANT_MUTATION_TOOL_NAME,
    getAssistantMessageActionCalls,
    getPendingAssistantToolMessages,
    parseAssistantActionEnvelope,
    lintAssistantActionEnvelope,
} from './assistant-protocol'

describe('assistant-protocol', () => {
    it('parses a valid tool input envelope', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [{ type: 'createAct', name: 'Review Flow' }],
        })

        expect(envelope?.actions).toHaveLength(1)
    })

    it('rejects invalid action payloads from tool input', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [{ type: 'updatePerformer', model: { provider: 'openai', modelId: 'gpt-4.1' } }],
        })

        expect(envelope).toBeNull()
    })

    it('parses a valid tool input envelope from JSON text', () => {
        const envelope = parseAssistantActionEnvelope(JSON.stringify({
            version: 1,
            actions: [{ type: 'createPerformer', ref: 'writer', name: 'Writer' }],
        }))

        expect(envelope?.actions).toHaveLength(1)
        expect(envelope?.actions[0]).toMatchObject({ type: 'createPerformer', name: 'Writer' })
    })

    it('normalizes empty performer Tal placeholders before linting', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [{
                type: 'createPerformer',
                ref: 'brand',
                name: 'Brand Strategist',
                model: { provider: 'openai', modelId: 'gpt-5.3-codex' },
                talUrn: null,
                talDraftId: '',
                talDraftRef: '',
                talDraft: {
                    ref: '',
                    name: '',
                    content: '',
                    slug: '',
                    description: '',
                    tags: [],
                    openEditor: false,
                },
            }],
        })

        expect(envelope).not.toBeNull()
        expect(envelope?.actions[0]).toMatchObject({
            type: 'createPerformer',
            ref: 'brand',
            name: 'Brand Strategist',
            model: { provider: 'openai', modelId: 'gpt-5.3-codex' },
        })
        expect((envelope?.actions[0] as { talDraft?: unknown }).talDraft).toBeUndefined()
        expect((envelope?.actions[0] as { talDraftId?: unknown }).talDraftId).toBeUndefined()
        expect((envelope?.actions[0] as { talDraftRef?: unknown }).talDraftRef).toBeUndefined()
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([])
    })

    it('extracts completed assistant mutation tool calls in order', () => {
        const calls = getAssistantMessageActionCalls({
            parts: [
                {
                    id: 'tool-1',
                    type: 'tool',
                    tool: {
                        name: ASSISTANT_MUTATION_TOOL_NAME,
                        callId: 'call-1',
                        status: 'completed',
                        input: {
                            version: 1,
                            actions: [{ type: 'createPerformer', ref: 'writer', name: 'Writer' }],
                        },
                    },
                },
                {
                    id: 'tool-2',
                    type: 'tool',
                    tool: {
                        name: ASSISTANT_MUTATION_TOOL_NAME,
                        callId: 'call-2',
                        status: 'completed',
                        input: {
                            version: 1,
                            actions: [{ type: 'createAct', name: 'Review Flow', participantPerformerNames: ['Writer'] }],
                        },
                    },
                },
            ],
        })

        expect(calls).toHaveLength(2)
        expect(calls[0].callId).toBe('call-1')
        expect(calls[0].actions[0]).toMatchObject({ type: 'createPerformer', name: 'Writer' })
        expect(calls[1].callId).toBe('call-2')
        expect(calls[1].actions[0]).toMatchObject({ type: 'createAct', name: 'Review Flow' })
    })

    it('ignores non-completed or non-assistant tool parts', () => {
        const calls = getAssistantMessageActionCalls({
            parts: [
                {
                    id: 'tool-1',
                    type: 'tool',
                    tool: {
                        name: ASSISTANT_MUTATION_TOOL_NAME,
                        callId: 'call-1',
                        status: 'running',
                        input: {
                            version: 1,
                            actions: [{ type: 'createPerformer', name: 'Writer' }],
                        },
                    },
                },
                {
                    id: 'tool-2',
                    type: 'tool',
                    tool: {
                        name: 'read_file',
                        callId: 'call-2',
                        status: 'completed',
                    },
                },
            ],
        })

        expect(calls).toEqual([])
    })

    it('accepts assistant mutation tool calls identified by metadata and string input', () => {
        const calls = getAssistantMessageActionCalls({
            parts: [
                {
                    id: 'tool-1',
                    type: 'tool',
                    tool: {
                        name: 'unknown',
                        callId: 'call-1',
                        status: 'completed',
                        metadata: {
                            studioAssistantMutation: true,
                        },
                        input: JSON.stringify({
                            version: 1,
                            actions: [{ type: 'createAct', name: 'Review Flow' }],
                        }) as unknown as Record<string, unknown>,
                    },
                },
            ],
        })

        expect(calls).toHaveLength(1)
        expect(calls[0].actions[0]).toMatchObject({ type: 'createAct', name: 'Review Flow' })
    })

    it('collects unapplied assistant tool messages without waiting for session idle', () => {
        const pending = getPendingAssistantToolMessages([
            {
                id: 'msg-1',
                role: 'assistant',
                parts: [
                    {
                        id: 'tool-1',
                        type: 'tool',
                        tool: {
                            name: ASSISTANT_MUTATION_TOOL_NAME,
                            callId: 'call-1',
                            status: 'completed',
                            input: {
                                version: 1,
                                actions: [{ type: 'createPerformer', name: 'Writer' }],
                            },
                        },
                    },
                ],
            },
            {
                id: 'msg-2',
                role: 'assistant',
                parts: [],
            },
            {
                id: 'msg-3',
                role: 'user',
                parts: [
                    {
                        id: 'tool-2',
                        type: 'tool',
                        tool: {
                            name: ASSISTANT_MUTATION_TOOL_NAME,
                            callId: 'call-2',
                            status: 'completed',
                            input: {
                                version: 1,
                                actions: [{ type: 'createAct', name: 'Review Flow' }],
                            },
                        },
                    },
                ],
            },
        ], {})

        expect(pending).toHaveLength(1)
        expect(pending[0]).toMatchObject({
            messageId: 'msg-1',
        })
        expect(pending[0].actionCalls[0].actions[0]).toMatchObject({ type: 'createPerformer', name: 'Writer' })
    })

    it('skips assistant messages that were already applied', () => {
        const pending = getPendingAssistantToolMessages([
            {
                id: 'msg-1',
                role: 'assistant',
                parts: [
                    {
                        id: 'tool-1',
                        type: 'tool',
                        tool: {
                            name: ASSISTANT_MUTATION_TOOL_NAME,
                            callId: 'call-1',
                            status: 'completed',
                            input: {
                                version: 1,
                                actions: [{ type: 'createPerformer', name: 'Writer' }],
                            },
                        },
                    },
                ],
            },
        ], { 'msg-1': true })

        expect(pending).toEqual([])
    })

    it('flags invalid same-call refs as lint errors', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [
                { type: 'createAct', name: 'Review Flow', participantPerformerRefs: ['writer', 'reviewer'] },
                { type: 'createPerformer', ref: 'writer', name: 'Writer' },
                { type: 'createPerformer', ref: 'reviewer', name: 'Reviewer' },
            ],
        })

        expect(envelope).not.toBeNull()
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([
            {
                level: 'warning',
                actionIndex: 0,
                message: 'createAct has multiple participants but no relations. This often produces a disconnected workflow.',
            },
            {
                level: 'error',
                actionIndex: 0,
                message: 'performer ref "writer" is used before it is created in the same tool call.',
            },
            {
                level: 'error',
                actionIndex: 0,
                message: 'performer ref "reviewer" is used before it is created in the same tool call.',
            },
        ])
    })
})
