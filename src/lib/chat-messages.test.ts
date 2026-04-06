import { describe, expect, it } from 'vitest'
import { mapSessionMessagesToChatMessages, mergeLiveSessionSnapshot, mergePendingOptimisticUserMessages } from './chat-messages'
import type { ChatMessage } from '../types'
import { reduceMessagePartUpdated, reduceMessageUpdated } from '../store/session/event-reducer'
import type { StudioState } from '../store/types'

describe('mergePendingOptimisticUserMessages', () => {
    it('keeps a temp user message while the session is still loading', () => {
        const optimistic: ChatMessage = {
            id: 'temp-123',
            role: 'user',
            content: 'hello',
            timestamp: 1_000,
        }

        expect(mergePendingOptimisticUserMessages([], [optimistic], true)).toEqual([optimistic])
    })

    it('does not duplicate an optimistic user message once the server mirror exists', () => {
        const optimistic: ChatMessage = {
            id: 'temp-123',
            role: 'user',
            content: 'hello',
            timestamp: 1_000,
        }
        const mirrored: ChatMessage = {
            id: 'msg-1',
            role: 'user',
            content: 'hello',
            timestamp: 1_005,
        }

        expect(mergePendingOptimisticUserMessages([mirrored], [optimistic], true)).toEqual([mirrored])
    })

    it('drops optimistic messages once the session is no longer loading', () => {
        const optimistic: ChatMessage = {
            id: 'temp-123',
            role: 'user',
            content: 'hello',
            timestamp: 1_000,
        }

        expect(mergePendingOptimisticUserMessages([], [optimistic], false)).toEqual([])
    })
})

describe('mergeLiveSessionSnapshot', () => {
    it('keeps the longer local assistant content while the session is still loading', () => {
        const serverMessage: ChatMessage = {
            id: 'msg-1',
            role: 'assistant',
            content: 'Hello\nWorld',
            timestamp: 2_000,
        }
        const currentMessage: ChatMessage = {
            id: 'msg-1',
            role: 'assistant',
            content: 'Hello\nWorld\nMore detail',
            timestamp: 2_000,
        }

        expect(mergeLiveSessionSnapshot([serverMessage], [currentMessage], {
            preserveOptimisticUserMessages: true,
            preserveStreamingAssistantMessages: true,
        })).toEqual([
            currentMessage,
        ])
    })

    it('preserves a local assistant message that is missing from a lagging snapshot while loading', () => {
        const currentMessage: ChatMessage = {
            id: 'msg-1',
            role: 'assistant',
            content: 'Partial assistant reply',
            timestamp: 2_000,
        }

        expect(mergeLiveSessionSnapshot([], [currentMessage], {
            preserveOptimisticUserMessages: true,
            preserveStreamingAssistantMessages: true,
        })).toEqual([
            currentMessage,
        ])
    })

    it('uses the server snapshot once the session is no longer loading', () => {
        const serverMessage: ChatMessage = {
            id: 'msg-1',
            role: 'assistant',
            content: 'Hello',
            timestamp: 2_000,
        }
        const currentMessage: ChatMessage = {
            id: 'msg-1',
            role: 'assistant',
            content: 'Hello\nWorld\nMore detail',
            timestamp: 2_000,
        }

        expect(mergeLiveSessionSnapshot([serverMessage], [currentMessage], {
            preserveOptimisticUserMessages: false,
            preserveStreamingAssistantMessages: false,
        })).toEqual([
            serverMessage,
        ])
    })
})

describe('mapSessionMessagesToChatMessages', () => {
    it('keeps snapshot text parts aligned with live reducer assembly', () => {
        const rawMessage = {
            id: 'msg-1',
            info: {
                id: 'msg-1',
                role: 'assistant',
                time: { created: 1000 },
            },
            parts: [
                { id: 'text-1', type: 'text', text: 'Hello' },
                { id: 'tool-1', type: 'tool', tool: 'wait_until', state: { status: 'completed' } },
                { id: 'text-2', type: 'text', text: 'World' },
            ],
        }
        const mapped = mapSessionMessagesToChatMessages([rawMessage as never])[0]

        const state = {
            seEntities: {},
            seMessages: {},
            seStatuses: {},
            sePermissions: {},
            seQuestions: {},
            seTodos: {},
            chatDrafts: {},
            chatPrefixes: {},
            chatKeyToSession: { 'performer-1': 'session-1' },
            sessionToChatKey: { 'session-1': 'performer-1' },
            sessionLoading: {},
            activeChatPerformerId: null,
            sessions: [],
        } as unknown as StudioState
        const get = () => state
        const set = (partial: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        reduceMessageUpdated('session-1', 'msg-1', 'assistant', 1000, get, set)
        reduceMessagePartUpdated('session-1', 'msg-1', {
            id: 'text-1',
            type: 'text',
            text: 'Hello',
        }, get, set)
        reduceMessagePartUpdated('session-1', 'msg-1', {
            id: 'tool-1',
            type: 'tool',
            tool: 'wait_until',
            state: { status: 'completed' },
        }, get, set)
        reduceMessagePartUpdated('session-1', 'msg-1', {
            id: 'text-2',
            type: 'text',
            text: 'World',
        }, get, set)

        expect(state.seMessages['session-1']![0]).toMatchObject({
            content: mapped.content,
            parts: mapped.parts,
        })
    })
})
