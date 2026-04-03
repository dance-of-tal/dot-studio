import { describe, expect, it } from 'vitest'
import { mergeLiveSessionSnapshot, mergePendingOptimisticUserMessages } from './chat-messages'
import type { ChatMessage } from '../types'

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
