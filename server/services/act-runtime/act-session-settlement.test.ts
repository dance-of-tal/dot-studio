import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    waitForSessionToSettleMock,
    extractNonRetryableSessionErrorMock,
    unwrapOpencodeResultMock,
} = vi.hoisted(() => ({
    waitForSessionToSettleMock: vi.fn(),
    extractNonRetryableSessionErrorMock: vi.fn(),
    unwrapOpencodeResultMock: vi.fn((value: { data?: unknown }) => value.data),
}))

vi.mock('../../lib/chat-session.js', () => ({
    waitForSessionToSettle: waitForSessionToSettleMock,
    extractNonRetryableSessionError: extractNonRetryableSessionErrorMock,
}))

vi.mock('../../lib/opencode-errors.js', () => ({
    unwrapOpencodeResult: unwrapOpencodeResultMock,
}))

describe('resolveActSessionSettlementOutcome', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns timeout when the session never settles', async () => {
        waitForSessionToSettleMock.mockResolvedValueOnce(false)

        const { resolveActSessionSettlementOutcome } = await import('./act-session-settlement.js')
        await expect(resolveActSessionSettlementOutcome(
            { session: { messages: vi.fn() } } as never,
            'session-1',
            '/tmp/workspace',
        )).resolves.toEqual({
            kind: 'timeout',
            message: 'Session did not settle before timeout.',
        })
    })

    it('returns fatal_error when the settled transcript contains a non-retryable failure', async () => {
        waitForSessionToSettleMock.mockResolvedValueOnce(true)
        extractNonRetryableSessionErrorMock.mockReturnValueOnce('Insufficient balance.')
        const messages = vi.fn().mockResolvedValueOnce({
            data: [{ info: { role: 'assistant' } }],
        })

        const { resolveActSessionSettlementOutcome } = await import('./act-session-settlement.js')
        await expect(resolveActSessionSettlementOutcome(
            { session: { messages } } as never,
            'session-1',
            '/tmp/workspace',
        )).resolves.toEqual({
            kind: 'fatal_error',
            message: 'Insufficient balance.',
        })
    })

    it('returns idle when the settled transcript has no fatal session error', async () => {
        waitForSessionToSettleMock.mockResolvedValueOnce(true)
        extractNonRetryableSessionErrorMock.mockReturnValueOnce(null)
        const messages = vi.fn().mockResolvedValueOnce({
            data: [{ info: { role: 'assistant' } }],
        })

        const { resolveActSessionSettlementOutcome } = await import('./act-session-settlement.js')
        await expect(resolveActSessionSettlementOutcome(
            { session: { messages } } as never,
            'session-1',
            '/tmp/workspace',
        )).resolves.toEqual({
            kind: 'idle',
        })
    })
})
