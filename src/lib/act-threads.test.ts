import { describe, expect, it } from 'vitest'
import {
    resolveActThreadOrdinal,
    resolveDisplayedActThread,
    resolvePreferredActThreadId,
} from './act-threads'

const threads = [
    { id: 'thread-1', createdAt: 100 },
    { id: 'thread-2', createdAt: 200 },
    { id: 'thread-3', createdAt: 300 },
]

describe('act thread helpers', () => {
    it('keeps the active thread when it still exists', () => {
        expect(resolvePreferredActThreadId(threads, 'thread-2')).toBe('thread-2')
    })

    it('falls back to the newest thread when the active thread is gone', () => {
        expect(resolvePreferredActThreadId(threads, 'missing-thread')).toBe('thread-3')
    })

    it('resolves the displayed thread from the preferred thread id', () => {
        expect(resolveDisplayedActThread(threads, 'missing-thread')?.id).toBe('thread-3')
    })

    it('returns the 1-based thread ordinal when present', () => {
        expect(resolveActThreadOrdinal(threads, 'thread-2')).toBe(2)
        expect(resolveActThreadOrdinal(threads, 'missing-thread')).toBeNull()
    })
})
