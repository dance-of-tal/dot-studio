import { describe, expect, it, vi } from 'vitest'
import { extractNonRetryableSessionError, waitForSessionToSettle } from '../../server/lib/chat-session.js'

describe('waitForSessionToSettle', () => {
    it('waits for a busy state before treating a missing status as settled when requested', async () => {
        const status = vi.fn()
            .mockResolvedValueOnce({ data: {} })
            .mockResolvedValueOnce({ data: { 'session-1': { type: 'busy' } } })
            .mockResolvedValueOnce({ data: {} })

        const settled = await waitForSessionToSettle(
            {
                session: { status },
            } as never,
            'session-1',
            { directory: '/tmp/workspace' },
            { timeoutMs: 200, pollMs: 1, requireObservedBusy: true },
        )

        expect(settled).toBe(true)
        expect(status).toHaveBeenCalledTimes(3)
    })

    it('treats a missing status as settled immediately by default', async () => {
        const status = vi.fn().mockResolvedValueOnce({ data: {} })

        const settled = await waitForSessionToSettle(
            {
                session: { status },
            } as never,
            'session-1',
            { directory: '/tmp/workspace' },
            { timeoutMs: 50, pollMs: 1 },
        )

        expect(settled).toBe(true)
        expect(status).toHaveBeenCalledTimes(1)
    })

    it('extracts non-retryable assistant session errors', () => {
        const error = extractNonRetryableSessionError([
            {
                info: {
                    role: 'assistant',
                    error: {
                        data: {
                            isRetryable: false,
                            message: 'Insufficient balance.',
                        },
                    },
                },
            },
        ])

        expect(error).toBe('Insufficient balance.')
    })

    it('ignores retryable assistant session errors', () => {
        const error = extractNonRetryableSessionError([
            {
                info: {
                    role: 'assistant',
                    error: {
                        data: {
                            isRetryable: true,
                            message: 'Temporary provider issue.',
                        },
                    },
                },
            },
        ])

        expect(error).toBeNull()
    })
})
