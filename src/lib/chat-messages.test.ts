import { describe, expect, it } from 'vitest'
import { mergePendingOptimisticUserMessages } from './chat-messages'
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
