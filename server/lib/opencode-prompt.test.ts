import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRunningSessions = vi.fn()

describe('retryOnAgentRegistryMiss', () => {
    beforeEach(() => {
        getRunningSessions.mockReset().mockResolvedValue(0)
    })

    it('disposes and retries once when the working directory is idle', async () => {
        const { retryOnAgentRegistryMiss } = await import('./opencode-prompt.js')
        const dispose = vi.fn().mockResolvedValue(undefined)
        const run = vi.fn()
            .mockRejectedValueOnce(new Error('Agent not found: "dot-studio/act/hash/participant-lead--build". Available agents: build'))
            .mockResolvedValueOnce('ok')

        const result = await retryOnAgentRegistryMiss({
            oc: { instance: { dispose } },
            directory: '/tmp/workspace',
            agentName: 'dot-studio/act/hash/participant-lead--build',
            getRunningSessions,
            logLabel: 'test',
            run,
        })

        expect(result).toBe('ok')
        expect(getRunningSessions).toHaveBeenCalledWith('/tmp/workspace')
        expect(dispose).toHaveBeenCalledWith({ directory: '/tmp/workspace' })
        expect(run).toHaveBeenCalledTimes(2)
    })

    it('does not dispose when another session is still running', async () => {
        const { retryOnAgentRegistryMiss } = await import('./opencode-prompt.js')
        const dispose = vi.fn().mockResolvedValue(undefined)
        const error = new Error('Agent not found: "dot-studio/act/hash/participant-lead--build". Available agents: build')
        const run = vi.fn().mockRejectedValue(error)
        getRunningSessions.mockResolvedValueOnce(1)

        await expect(retryOnAgentRegistryMiss({
            oc: { instance: { dispose } },
            directory: '/tmp/workspace',
            agentName: 'dot-studio/act/hash/participant-lead--build',
            getRunningSessions,
            logLabel: 'test',
            run,
        })).rejects.toBe(error)

        expect(getRunningSessions).toHaveBeenCalledWith('/tmp/workspace')
        expect(dispose).not.toHaveBeenCalled()
        expect(run).toHaveBeenCalledTimes(1)
    })
})
