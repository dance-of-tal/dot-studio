import { describe, expect, it } from 'vitest'
import { canAbortSessionExecution, resolveSessionActivity } from './session-activity'

describe('session activity', () => {
    it('treats raw loading as a short optimistic bridge before status arrives', () => {
        expect(resolveSessionActivity({
            loading: true,
            status: undefined,
            messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
            permission: null,
            question: null,
        })).toMatchObject({
            kind: 'optimistic',
            isActive: true,
            canAbort: true,
            isTransportActive: true,
        })
    })

    it('prefers concrete busy status over local loading and clears optimistic dependence', () => {
        expect(resolveSessionActivity({
            loading: false,
            status: { type: 'busy' },
            messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
            permission: null,
            question: null,
        })).toMatchObject({
            kind: 'running',
            isActive: true,
            canAbort: true,
            isTransportActive: true,
        })
    })

    it('treats interactive permission and question waits as non-abortable idle UI states', () => {
        expect(resolveSessionActivity({
            loading: true,
            status: { type: 'busy' },
            messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
            permission: { id: 'perm-1' } as never,
            question: null,
        })).toMatchObject({
            kind: 'interactive',
            isActive: false,
            canAbort: false,
        })
    })

    it('treats wait_until parked turns as non-active and non-abortable', () => {
        expect(canAbortSessionExecution({
            loading: true,
            status: { type: 'busy' },
            messages: [{
                id: 'msg-1',
                role: 'assistant',
                content: '',
                timestamp: 1,
                parts: [{
                    id: 'tool-1',
                    type: 'tool',
                    tool: {
                        name: 'wait_until',
                        callId: 'call-1',
                        status: 'completed',
                    },
                }],
            }],
            permission: null,
            question: null,
        })).toBe(false)
    })

    it('keeps wait_until turns parked even if a later tool part appears in the same assistant turn', () => {
        expect(resolveSessionActivity({
            loading: true,
            status: { type: 'busy' },
            messages: [{
                id: 'msg-1',
                role: 'assistant',
                content: '',
                timestamp: 1,
                parts: [
                    {
                        id: 'tool-1',
                        type: 'tool',
                        tool: {
                            name: 'wait_until',
                            callId: 'call-1',
                            status: 'completed',
                        },
                    },
                    {
                        id: 'tool-2',
                        type: 'tool',
                        tool: {
                            name: 'list_shared_board',
                            callId: 'call-2',
                            status: 'completed',
                        },
                    },
                ],
            }],
            permission: null,
            question: null,
        })).toMatchObject({
            kind: 'parked',
            isActive: false,
            canAbort: false,
            isTransportActive: false,
        })
    })

    it('clears the parked state once a later system wake-up message arrives', () => {
        expect(resolveSessionActivity({
            loading: true,
            status: { type: 'busy' },
            messages: [
                {
                    id: 'msg-1',
                    role: 'assistant',
                    content: '',
                    timestamp: 1,
                    parts: [{
                        id: 'tool-1',
                        type: 'tool',
                        tool: {
                            name: 'wait_until',
                            callId: 'call-1',
                            status: 'completed',
                        },
                    }],
                },
                {
                    id: 'msg-2',
                    role: 'system',
                    content: 'Wake-up: teammate replied.',
                    timestamp: 2,
                },
            ],
            permission: null,
            question: null,
        })).toMatchObject({
            kind: 'running',
            isActive: true,
            canAbort: true,
            isTransportActive: true,
        })
    })

    it('does not revive settled sessions from stale loading once idle status is known', () => {
        expect(resolveSessionActivity({
            loading: true,
            status: { type: 'idle' },
            messages: [{
                id: 'msg-1',
                role: 'assistant',
                content: 'done',
                timestamp: 1,
            }],
            permission: null,
            question: null,
        })).toMatchObject({
            kind: 'idle',
            isActive: false,
            canAbort: false,
        })
    })

    it('does not treat stale optimistic loading as active after a settled assistant step-finish snapshot', () => {
        expect(resolveSessionActivity({
            loading: true,
            status: undefined,
            messages: [{
                id: 'msg-1',
                role: 'assistant',
                content: 'done',
                timestamp: 1,
                parts: [{
                    id: 'part-1',
                    type: 'step-finish',
                }],
            }],
            permission: null,
            question: null,
        })).toMatchObject({
            kind: 'idle',
            isActive: false,
            canAbort: false,
            isTransportActive: false,
        })
    })
})
