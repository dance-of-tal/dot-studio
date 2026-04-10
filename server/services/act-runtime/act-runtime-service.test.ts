import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ActDefinition } from '../../../shared/act-types.js'

const ensurePerformerProjectionMock = vi.fn()
const clearParticipantCircuitMock = vi.fn()
const clearParticipantQueueRunningMock = vi.fn()
const drainParticipantQueueAfterSettlementMock = vi.fn()
const markParticipantQueueRunningMock = vi.fn()
const processWakeCascadeMock = vi.fn()
const processWakeTargetsMock = vi.fn()
const tripParticipantCircuitMock = vi.fn()

vi.mock('../opencode-projection/stage-projection-service.js', () => ({
    ensurePerformerProjection: ensurePerformerProjectionMock,
}))

vi.mock('./wake-cascade.js', () => ({
    clearParticipantCircuit: clearParticipantCircuitMock,
    clearParticipantQueueRunning: clearParticipantQueueRunningMock,
    drainParticipantQueueAfterSettlement: drainParticipantQueueAfterSettlementMock,
    markParticipantQueueRunning: markParticipantQueueRunningMock,
    processWakeCascade: processWakeCascadeMock,
    processWakeTargets: processWakeTargetsMock,
    tripParticipantCircuit: tripParticipantCircuitMock,
}))

const actDefinition: ActDefinition = {
    id: 'act-invest',
    name: 'Investment Team',
    participants: {
        Head: {
            performerRef: { kind: 'draft', draftId: 'performer-head' },
            subscriptions: {
                eventTypes: ['runtime.idle'],
            },
        },
        Analyst: {
            performerRef: { kind: 'draft', draftId: 'performer-analyst' },
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['Head', 'Analyst'],
            direction: 'both',
            name: 'Delegation',
            description: 'Exchange research updates.',
        },
    ],
}

describe('ActRuntimeService projection prewarm', () => {
    let studioDir: string
    let workingDir: string

    beforeEach(async () => {
        studioDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-act-service-'))
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-working-'))
        process.env.STUDIO_DIR = studioDir
        vi.resetModules()
        ensurePerformerProjectionMock.mockReset().mockResolvedValue({
            compiled: {},
            toolResolution: {},
            toolMap: {},
            capabilitySnapshot: null,
            changed: true,
        })
        clearParticipantCircuitMock.mockReset()
        clearParticipantQueueRunningMock.mockReset()
        drainParticipantQueueAfterSettlementMock.mockReset()
        markParticipantQueueRunningMock.mockReset()
        processWakeCascadeMock.mockReset().mockResolvedValue({
            targets: [],
            injected: [],
            queued: [],
            errors: [],
        })
        processWakeTargetsMock.mockReset().mockResolvedValue({
            targets: [],
            injected: [],
            queued: [],
            errors: [],
        })
        tripParticipantCircuitMock.mockReset()

        const { workspaceIdForDir, workspaceDir } = await import('../../lib/config.js')
        const wsDir = workspaceDir(workspaceIdForDir(workingDir))
        await fs.mkdir(wsDir, { recursive: true })
        await fs.writeFile(path.join(wsDir, 'workspace.json'), JSON.stringify({
            performers: [
                {
                    id: 'performer-head',
                    name: 'Head Performer',
                    model: { provider: 'openai', modelId: 'gpt-5.4' },
                    talRef: null,
                    danceRefs: [],
                    mcpServerNames: [],
                },
                {
                    id: 'performer-analyst',
                    name: 'Analyst Performer',
                    model: { provider: 'openai', modelId: 'gpt-5.4' },
                    talRef: null,
                    danceRefs: [],
                    mcpServerNames: [],
                },
            ],
        }, null, 2), 'utf-8')
    })

    afterEach(async () => {
        vi.useRealTimers()
        delete process.env.STUDIO_DIR
        await fs.rm(studioDir, { recursive: true, force: true }).catch(() => {})
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        vi.resetModules()
    })

    it('prewarms participant projections when a thread is created', async () => {
        const { getActRuntimeService } = await import('./act-runtime-service.js')

        const result = await getActRuntimeService(workingDir).createThread(actDefinition.id, actDefinition)

        expect(result.ok).toBe(true)
        expect(ensurePerformerProjectionMock).toHaveBeenCalledTimes(2)
        expect(ensurePerformerProjectionMock).toHaveBeenCalledWith(expect.objectContaining({
            performerId: 'Head',
            performerName: 'Head Performer',
            scope: 'act',
            actId: actDefinition.id,
        }))
        expect(ensurePerformerProjectionMock).toHaveBeenCalledWith(expect.objectContaining({
            performerId: 'Analyst',
            performerName: 'Analyst Performer',
            scope: 'act',
            actId: actDefinition.id,
        }))
    })

    it('emits a single runtime idle follow-up without recursively re-emitting idle', async () => {
        processWakeCascadeMock
            .mockResolvedValueOnce({
                targets: [{ participantKey: 'Analyst', reason: 'subscription' }],
                injected: ['Analyst'],
                queued: [],
                errors: [],
            })
            .mockResolvedValueOnce({
                targets: [{ participantKey: 'Head', reason: 'subscription' }],
                injected: ['Head'],
                queued: [],
                errors: [],
            })

        const { getActRuntimeService } = await import('./act-runtime-service.js')
        const service = getActRuntimeService(workingDir)

        const created = await service.createThread(actDefinition.id, actDefinition)
        expect(created.ok).toBe(true)

        const sent = await service.sendMessage(created.thread.id, {
            from: 'Head',
            to: 'Analyst',
            content: 'Review the latest memo.',
            tag: 'handoff',
        })
        expect(sent.ok).toBe(true)

        await vi.waitFor(() => {
            expect(processWakeCascadeMock).toHaveBeenCalledTimes(2)
        })

        const events = await service.getRecentEvents(created.thread.id)
        expect(events.ok).toBe(true)
        expect(events.events.filter((event) => event.type === 'runtime.idle')).toHaveLength(1)
        expect(processWakeCascadeMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            type: 'message.sent',
            sourceType: 'performer',
            source: 'Head',
        }))
        expect(processWakeCascadeMock.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
            type: 'runtime.idle',
            sourceType: 'system',
            source: 'runtime',
        }))

        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(processWakeCascadeMock).toHaveBeenCalledTimes(2)
    })

    it('does not emit runtime idle when the cascade only queued blocked work', async () => {
        processWakeCascadeMock.mockResolvedValueOnce({
            targets: [{ participantKey: 'Analyst', reason: 'subscription' }],
            injected: [],
            queued: ['Analyst'],
            errors: [],
        })

        const { getActRuntimeService } = await import('./act-runtime-service.js')
        const service = getActRuntimeService(workingDir)

        const created = await service.createThread(actDefinition.id, actDefinition)
        expect(created.ok).toBe(true)

        const sent = await service.sendMessage(created.thread.id, {
            from: 'Head',
            to: 'Analyst',
            content: 'Review the latest memo.',
            tag: 'handoff',
        })
        expect(sent.ok).toBe(true)

        await vi.waitFor(() => {
            expect(processWakeCascadeMock).toHaveBeenCalledTimes(1)
        })

        const events = await service.getRecentEvents(created.thread.id)
        expect(events.ok).toBe(true)
        expect(events.events.filter((event) => event.type === 'runtime.idle')).toHaveLength(0)
    })

    it('immediately re-queues an already satisfied wait condition', async () => {
        const { getActRuntimeService } = await import('./act-runtime-service.js')
        const service = getActRuntimeService(workingDir)
        const created = await service.createThread(actDefinition.id, actDefinition)
        expect(created.ok).toBe(true)

        const boardResult = await service.postToBoard(created.thread.id, {
            author: 'Head',
            key: 'review-summary',
            kind: 'artifact',
            content: 'Summary is ready.',
        })
        expect(boardResult.ok).toBe(true)
        processWakeCascadeMock.mockClear()

        const wakeResult = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Read review-summary and hand off your answer.',
            condition: { type: 'board_key_exists', key: 'review-summary' },
        })
        expect(wakeResult.ok).toBe(true)

        await vi.waitFor(() => {
            expect(processWakeTargetsMock).toHaveBeenCalledTimes(1)
        })
        expect(processWakeTargetsMock).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    participantKey: 'Analyst',
                    reason: 'wake-condition',
                    wakeCondition: expect.objectContaining({
                        onSatisfiedMessage: 'Read review-summary and hand off your answer.',
                        status: 'triggered',
                    }),
                }),
            ],
            actDefinition,
            expect.anything(),
            expect.anything(),
            created.thread.id,
            workingDir,
        )
    })

    it('self-wakes wake_at waits without needing another runtime event', async () => {
        vi.useFakeTimers()

        const { getActRuntimeService } = await import('./act-runtime-service.js')
        const service = getActRuntimeService(workingDir)
        const created = await service.createThread(actDefinition.id, actDefinition)
        expect(created.ok).toBe(true)

        const wakeResult = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Resume after the scheduled wake and continue.',
            condition: { type: 'wake_at', at: Date.now() + 1_000 },
        })
        expect(wakeResult.ok).toBe(true)
        expect(processWakeTargetsMock).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1_000)
        await vi.waitFor(() => {
            expect(processWakeTargetsMock).toHaveBeenCalledTimes(1)
        })
        expect(processWakeTargetsMock).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    participantKey: 'Analyst',
                    reason: 'wake-condition',
                    wakeCondition: expect.objectContaining({
                        onSatisfiedMessage: 'Resume after the scheduled wake and continue.',
                        status: 'triggered',
                    }),
                }),
            ],
            actDefinition,
            expect.anything(),
            expect.anything(),
            created.thread.id,
            workingDir,
        )
    })

    it('rejects unsupported wait condition types instead of storing silent fallbacks', async () => {
        const { getActRuntimeService } = await import('./act-runtime-service.js')
        const service = getActRuntimeService(workingDir)
        const created = await service.createThread(actDefinition.id, actDefinition)
        expect(created.ok).toBe(true)

        const result = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Resume later.',
            condition: { type: 'timeout', at: Date.now() + 1_000 } as never,
        })

        expect(result).toEqual({
            ok: false,
            status: 400,
            error: 'condition.type "timeout" is not supported',
        })
    })
})
