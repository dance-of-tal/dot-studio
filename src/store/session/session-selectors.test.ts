import { describe, expect, it } from 'vitest'
import type { StudioState } from '../types'
import { selectMessagesForChatKey } from './session-selectors'

function createMinimalState(overrides: Partial<StudioState> = {}): StudioState {
    return {
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        historyCursors: {},
        chats: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        sessionMap: {},
        loadingPerformerId: null,
        sessions: [],
        pendingPermissions: {},
        pendingQuestions: {},
        todos: {},
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
})
