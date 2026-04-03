import { describe, expect, it } from 'vitest'
import type { StudioState } from '../types'
import { selectChatSessionState, selectMessagesForChatKey, selectSessionCanAbort, selectSessionIsLoading, selectStreamTarget } from './session-selectors'

function createMinimalState(overrides: Partial<StudioState> = {}): StudioState {
    return {
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatDrafts: {},
        chatPrefixes: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionMutationPending: {},
        sessionReverts: {},
        activeChatPerformerId: null,
        sessions: [],
        ...overrides,
    } as StudioState
}

describe('session selectors', () => {
    it('prepends system prefix messages to entity-backed chat messages', () => {
        const sessionId = 'session-1'
        const chatKey = 'performer-1'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            chatPrefixes: {
                [chatKey]: [
                    { id: 'prefix-1', role: 'system', content: 'prefix', timestamp: 1 },
                ],
            },
            seMessages: {
                [sessionId]: [
                    { id: 'msg-1', role: 'assistant', content: 'hello', timestamp: 2 },
                ],
            },
        })

        expect(selectMessagesForChatKey(state, chatKey).map((message) => message.id)).toEqual([
            'prefix-1',
            'msg-1',
        ])
    })

    it('does not duplicate prefix messages already present in entity messages', () => {
        const sessionId = 'session-1'
        const chatKey = 'performer-1'
        const shared = { id: 'prefix-1', role: 'system' as const, content: 'prefix', timestamp: 1 }
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            chatPrefixes: { [chatKey]: [shared] },
            seMessages: {
                [sessionId]: [
                    shared,
                    { id: 'msg-1', role: 'assistant', content: 'hello', timestamp: 2 },
                ],
            },
        })

        expect(selectMessagesForChatKey(state, chatKey).map((message) => message.id)).toEqual([
            'prefix-1',
            'msg-1',
        ])
    })

    it('returns structured act participant stream targets', () => {
        const sessionId = 'session-1'
        const chatKey = 'act:act-1:thread:thread-1:participant:participant-2'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
        })

        expect(selectStreamTarget(state, sessionId)).toEqual({
            kind: 'act-participant',
            chatKey,
            actId: 'act-1',
            threadId: 'thread-1',
            participantKey: 'participant-2',
        })
    })

    it('does not treat wait_until parked sessions as loading', () => {
        const sessionId = 'session-1'
        const state = createMinimalState({
            sessionLoading: { [sessionId]: true },
            seStatuses: { [sessionId]: { type: 'busy' } },
            seMessages: {
                [sessionId]: [{
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
            },
        })

        expect(selectSessionIsLoading(state, sessionId)).toBe(false)
    })

    it('allows abort during optimistic send before the first status event arrives', () => {
        const sessionId = 'session-1'
        const state = createMinimalState({
            sessionLoading: { [sessionId]: true },
            seMessages: {
                [sessionId]: [
                    { id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 },
                ],
            },
        })

        expect(selectSessionIsLoading(state, sessionId)).toBe(true)
        expect(selectSessionCanAbort(state, sessionId)).toBe(true)
    })

    it('keeps mutation pending separate from execution loading', () => {
        const sessionId = 'session-1'
        const chatKey = 'performer-1'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionMutationPending: { [sessionId]: true },
            seStatuses: { [sessionId]: { type: 'idle' } },
        })

        const session = selectChatSessionState(state, chatKey)
        expect(session.isMutating).toBe(true)
        expect(session.isLoading).toBe(false)
        expect(session.canAbort).toBe(false)
    })
})
