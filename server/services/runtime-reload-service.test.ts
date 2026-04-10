import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionListMock = vi.fn()
const sessionStatusMock = vi.fn()
const sessionMessagesMock = vi.fn()
const instanceDisposeMock = vi.fn()
const clearProjectionRuntimePendingMock = vi.fn()

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
        session: {
            list: sessionListMock,
            messages: sessionMessagesMock,
            status: sessionStatusMock,
        },
        instance: {
            dispose: instanceDisposeMock,
        },
    }),
}))

vi.mock('./opencode-projection/projection-manifest.js', () => ({
    clearProjectionRuntimePending: clearProjectionRuntimePendingMock,
}))

describe('countRunningSessions', () => {
    beforeEach(() => {
        sessionListMock.mockReset().mockResolvedValue({
            data: [
                { id: 'session-performer' },
                { id: 'session-act' },
            ],
        })
        sessionStatusMock.mockReset().mockResolvedValue({
            data: {
                'session-performer': { type: 'busy' },
                'session-act': { type: 'busy' },
            },
        })
        sessionMessagesMock.mockReset().mockResolvedValue({ data: [] })
        instanceDisposeMock.mockReset().mockResolvedValue({})
        clearProjectionRuntimePendingMock.mockReset().mockResolvedValue(undefined)
    })

    it('counts all busy sessions in the working directory', async () => {
        const { countRunningSessions } = await import('./runtime-reload-service.js')

        const result = await countRunningSessions('/tmp/workspace')

        expect(result.runningSessions).toBe(2)
    })

    it('ignores idle sessions', async () => {
        sessionStatusMock.mockResolvedValueOnce({
            data: {
                'session-performer': { type: 'idle' },
                'session-act': { type: 'busy' },
            },
        })
        const { countRunningSessions } = await import('./runtime-reload-service.js')

        const result = await countRunningSessions('/tmp/workspace')

        expect(result.runningSessions).toBe(1)
    })

    it('ignores busy sessions whose latest assistant turn is already parked by wait_until', async () => {
        sessionMessagesMock
            .mockResolvedValueOnce({
                data: [{
                    info: { role: 'assistant' },
                    parts: [{
                        type: 'tool',
                        tool: 'wait_until',
                        state: { status: 'completed' },
                    }],
                }],
            })
            .mockResolvedValueOnce({ data: [] })
        const { countRunningSessions } = await import('./runtime-reload-service.js')

        const result = await countRunningSessions('/tmp/workspace')

        expect(result.runningSessions).toBe(1)
    })

    it('ignores busy sessions whose latest assistant turn is already settled', async () => {
        sessionMessagesMock
            .mockResolvedValueOnce({
                data: [{
                    info: { role: 'assistant' },
                    parts: [{
                        type: 'step-finish',
                    }],
                }],
            })
            .mockResolvedValueOnce({ data: [] })
        const { countRunningSessions } = await import('./runtime-reload-service.js')

        const result = await countRunningSessions('/tmp/workspace')

        expect(result.runningSessions).toBe(1)
    })
})

describe('applyStudioRuntimeReload', () => {
    beforeEach(() => {
        sessionListMock.mockReset().mockResolvedValue({
            data: [{ id: 'session-1' }],
        })
        sessionStatusMock.mockReset().mockResolvedValue({
            data: {
                'session-1': { type: 'idle' },
            },
        })
        sessionMessagesMock.mockReset().mockResolvedValue({ data: [] })
        instanceDisposeMock.mockReset().mockResolvedValue({})
        clearProjectionRuntimePendingMock.mockReset().mockResolvedValue(undefined)
    })

    it('clears pending projection adoption after a successful runtime reload dispose', async () => {
        const { applyStudioRuntimeReload } = await import('./runtime-reload-service.js')

        const result = await applyStudioRuntimeReload('/tmp/workspace')

        expect(result.applied).toBe(true)
        expect(instanceDisposeMock).toHaveBeenCalledWith({ directory: '/tmp/workspace' })
        expect(clearProjectionRuntimePendingMock).toHaveBeenCalledWith('/tmp/workspace')
    })
})
