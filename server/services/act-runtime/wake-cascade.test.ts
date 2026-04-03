import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ActDefinition, MailboxEvent } from '../../../shared/act-types.js'

const promptAsync = vi.fn()
const sessionMessages = vi.fn()
const waitForSessionToSettle = vi.fn()
const resolveSessionExecutionContext = vi.fn()
const resolvePerformerForWake = vi.fn()
const prepareRuntimeForExecution = vi.fn()
const countRunningSessions = vi.fn()

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        session: {
            promptAsync,
            messages: sessionMessages,
        },
    }),
}))

vi.mock('../../lib/chat-session.js', () => ({
    waitForSessionToSettle,
    extractNonRetryableSessionError: vi.fn(() => null),
}))

vi.mock('../session-ownership-service.js', () => ({
    resolveSessionOwnership: resolveSessionExecutionContext,
}))

vi.mock('./wake-performer-resolver.js', () => ({
    resolvePerformerForWake,
}))

vi.mock('../runtime-preparation-service.js', () => ({
    prepareRuntimeForExecution,
}))

vi.mock('../runtime-reload-service.js', () => ({
    countRunningSessions,
}))

vi.mock('../opencode-projection/stage-projection-service.js', () => ({
    ensurePerformerProjection: vi.fn(),
}))

const actDefinition: ActDefinition = {
    id: 'act-review',
    name: 'Review Team',
    participants: {
        Lead: {
            performerRef: { kind: 'draft', draftId: 'lead-v1' },
            displayName: 'Lead',
        },
        Researcher: {
            performerRef: { kind: 'draft', draftId: 'researcher-v1' },
            displayName: 'Researcher',
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['Lead', 'Researcher'],
            direction: 'both',
            name: 'Review Loop',
            description: 'Exchange findings.',
        },
    ],
}

describe('wake-cascade participant scheduling', () => {
    let tempDir: string

    beforeEach(async () => {
        vi.resetModules()
        vi.useRealTimers()
        promptAsync.mockReset().mockResolvedValue({ data: { ok: true } })
        sessionMessages.mockReset().mockResolvedValue({ data: [] })
        waitForSessionToSettle.mockReset().mockResolvedValue(true)
        resolvePerformerForWake.mockReset().mockResolvedValue(null)
        prepareRuntimeForExecution.mockReset().mockImplementation(async (_workingDir: string, buildPayload: () => Promise<unknown>) => ({
            appliedReload: false,
            requiresDispose: false,
            blocked: false,
            reason: null,
            payload: await buildPayload(),
        }))
        countRunningSessions.mockReset().mockResolvedValue({ runningSessions: 0 })
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-wake-cascade-'))
        resolveSessionExecutionContext.mockReset().mockResolvedValue({ workingDir: tempDir })
    })

    afterEach(async () => {
        vi.useRealTimers()
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('queues teammate wakes when the same participant is still running, then drains them after settlement', async () => {
        const { Mailbox } = await import('./mailbox.js')
        const {
            processWakeCascade,
            drainParticipantQueueAfterSettlement,
            markParticipantQueueRunning,
        } = await import('./wake-cascade.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-1'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review the board update.',
            threadId,
        })

        const event: MailboxEvent = {
            id: 'evt-1',
            type: 'message.sent',
            sourceType: 'performer',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                from: 'Lead',
                to: 'Researcher',
                threadId,
            },
        }

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getPerformerSession: vi.fn().mockImplementation((_tid: string, participantKey: string) =>
                participantKey === 'Researcher' ? 'session-researcher' : null,
            ),
            getOrCreateSession: vi.fn(),
        } as const

        markParticipantQueueRunning(threadId, 'Researcher')

        const queued = await processWakeCascade(
            event,
            actDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(queued.injected).toEqual([])
        expect(queued.queued).toEqual(['Researcher'])
        expect(promptAsync).not.toHaveBeenCalled()

        const drained = await drainParticipantQueueAfterSettlement(
            'Researcher',
            actDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(drained.injected).toEqual(['Researcher'])
        expect(promptAsync).toHaveBeenCalledTimes(1)
        expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
            sessionID: 'session-researcher',
            directory: tempDir,
        }))
    })

    it('injects different participant wakes without waiting for another participant to settle', async () => {
        const { Mailbox } = await import('./mailbox.js')
        const {
            processWakeCascade,
            markParticipantQueueRunning,
        } = await import('./wake-cascade.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-2'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review the board update.',
            threadId,
        })

        const secondActDefinition: ActDefinition = {
            ...actDefinition,
            participants: {
                Researcher: {
                    performerRef: { kind: 'draft', draftId: 'researcher-v1' },
                    displayName: 'Researcher',
                    subscriptions: {
                        callboardKeys: ['shared/*'],
                    },
                },
                Reviewer: {
                    performerRef: { kind: 'draft', draftId: 'reviewer-v1' },
                    displayName: 'Reviewer',
                    subscriptions: {
                        callboardKeys: ['shared/*'],
                    },
                },
                Lead: actDefinition.participants.Lead,
            },
            relations: [
                ...actDefinition.relations,
                {
                    id: 'rel-2',
                    between: ['Lead', 'Reviewer'],
                    direction: 'both',
                    name: 'Review Coordination',
                    description: 'Exchange findings.',
                },
            ],
        }

        const event: MailboxEvent = {
            id: 'evt-2',
            type: 'board.updated',
            sourceType: 'performer',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                key: 'shared/review-summary',
                author: 'Lead',
                kind: 'artifact',
                threadId,
            },
        }

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getPerformerSession: vi.fn().mockImplementation((_tid: string, participantKey: string) => {
                if (participantKey === 'Researcher') return 'session-researcher'
                if (participantKey === 'Reviewer') return 'session-reviewer'
                return null
            }),
            getOrCreateSession: vi.fn(),
        } as const

        markParticipantQueueRunning(threadId, 'Lead')

        const cascade = await processWakeCascade(
            event,
            secondActDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(cascade.injected.sort()).toEqual(['Researcher', 'Reviewer'])
        expect(cascade.queued).toEqual([])
        expect(promptAsync).toHaveBeenCalledTimes(2)
        expect(promptAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
            sessionID: 'session-researcher',
            directory: tempDir,
        }))
        expect(promptAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
            sessionID: 'session-reviewer',
            directory: tempDir,
        }))
    })

    it('defers blocked participant wakes and retries them after the working directory becomes idle', async () => {
        vi.useFakeTimers()

        const { Mailbox } = await import('./mailbox.js')
        const { processWakeCascade } = await import('./wake-cascade.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-3'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review this when you can.',
            threadId,
        })

        const event: MailboxEvent = {
            id: 'evt-3',
            type: 'message.sent',
            sourceType: 'performer',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                from: 'Lead',
                to: 'Researcher',
                threadId,
            },
        }

        resolvePerformerForWake.mockResolvedValue({
            performerName: 'Researcher',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
        })
        prepareRuntimeForExecution
            .mockResolvedValueOnce({
                appliedReload: false,
                requiresDispose: true,
                blocked: true,
                reason: 'projection_update_pending',
                payload: {
                    changed: true,
                    compiled: { agentNames: {} },
                    toolMap: {},
                },
            })
            .mockResolvedValueOnce({
                appliedReload: true,
                requiresDispose: true,
                blocked: false,
                reason: null,
                payload: {
                    changed: true,
                    compiled: { agentNames: {} },
                    toolMap: {},
                },
            })
        countRunningSessions
            .mockResolvedValueOnce({ runningSessions: 1 })
            .mockResolvedValueOnce({ runningSessions: 0 })

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getPerformerSession: vi.fn().mockReturnValue('session-researcher'),
            getOrCreateSession: vi.fn(),
        } as const

        const cascade = await processWakeCascade(
            event,
            actDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(cascade.injected).toEqual([])
        expect(cascade.queued).toEqual(['Researcher'])
        expect(promptAsync).not.toHaveBeenCalled()
        expect(mailbox.getMessagesFor('Researcher')).toHaveLength(1)

        await vi.advanceTimersByTimeAsync(500)
        await Promise.resolve()
        expect(promptAsync).toHaveBeenCalledTimes(1)
        expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
            sessionID: 'session-researcher',
            directory: tempDir,
        }))
        expect(mailbox.getMessagesFor('Researcher')).toHaveLength(0)
    })
})
