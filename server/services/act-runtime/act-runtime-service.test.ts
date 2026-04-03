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
})
