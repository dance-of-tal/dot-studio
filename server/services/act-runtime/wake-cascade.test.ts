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

describe('wake-cascade serialization', () => {
    let tempDir: string

    beforeEach(async () => {
        vi.resetModules()
        promptAsync.mockReset().mockResolvedValue({ data: { ok: true } })
        sessionMessages.mockReset().mockResolvedValue({ data: [] })
        waitForSessionToSettle.mockReset().mockResolvedValue(true)
        resolvePerformerForWake.mockReset().mockResolvedValue(null)
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-wake-cascade-'))
        resolveSessionExecutionContext.mockReset().mockResolvedValue({ workingDir: tempDir })
    })

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('queues teammate wakes while another participant session is still running, then drains them after settlement', async () => {
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

        markParticipantQueueRunning(threadId, 'Lead')

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
            'Lead',
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
})
