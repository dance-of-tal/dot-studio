import { beforeEach, describe, expect, it, vi } from 'vitest'

const statusMock = vi.fn()
const messagesMock = vi.fn()

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
        session: {
            status: statusMock,
            messages: messagesMock,
        },
    }),
}))

describe('getStudioChatSessionStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('derives idle when OpenCode status is missing but a completed assistant message exists', async () => {
        statusMock.mockResolvedValueOnce({ data: {} })
        messagesMock.mockResolvedValueOnce({
            data: [
                {
                    info: {
                        role: 'assistant',
                        time: { completed: 123 },
                    },
                    parts: [
                        { type: 'text', text: 'Done.' },
                    ],
                },
            ],
        })

        const { getStudioChatSessionStatus } = await import('./chat-session-service.js')
        await expect(getStudioChatSessionStatus('/tmp/workspace', 'session-1')).resolves.toEqual({
            status: { type: 'idle' },
        })
    })
})
