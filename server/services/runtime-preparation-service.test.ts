import { beforeEach, describe, expect, it, vi } from 'vitest'

const instanceDisposeMock = vi.fn()
const countRunningSessionsMock = vi.fn()

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: {
            dispose: instanceDisposeMock,
        },
    }),
}))

vi.mock('./runtime-reload-service.js', () => ({
    countRunningSessions: countRunningSessionsMock,
}))

describe('prepareRuntimeForExecution', () => {
    beforeEach(() => {
        instanceDisposeMock.mockReset().mockResolvedValue({})
        countRunningSessionsMock.mockReset().mockResolvedValue({ runningSessions: 0 })
    })

    it('disposes when projection output changed and no session is running', async () => {
        const { prepareRuntimeForExecution } = await import('./runtime-preparation-service.js')

        const result = await prepareRuntimeForExecution('/tmp/workspace', async () => ({ changed: true }))

        expect(result.blocked).toBe(false)
        expect(result.requiresDispose).toBe(true)
        expect(instanceDisposeMock).toHaveBeenCalledWith({ directory: '/tmp/workspace' })
    })

    it('blocks when projection output changed while another session is running', async () => {
        countRunningSessionsMock.mockResolvedValueOnce({ runningSessions: 1 })
        const { prepareRuntimeForExecution } = await import('./runtime-preparation-service.js')

        const result = await prepareRuntimeForExecution('/tmp/workspace', async () => ({ changed: true }))

        expect(result.blocked).toBe(true)
        expect(result.reason).toBe('projection_update_pending')
        expect(instanceDisposeMock).not.toHaveBeenCalled()
    })
})
