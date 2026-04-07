import { beforeEach, describe, expect, it, vi } from 'vitest'

const parseActSessionOwnershipOwnerId = vi.fn()
const resolveSessionOwnership = vi.fn()
const registerParticipantSession = vi.fn()
const setParticipantSessionStatus = vi.fn()

vi.mock('../session-ownership-service.js', () => ({
    parseActSessionOwnershipOwnerId,
    resolveSessionOwnership,
}))

vi.mock('./act-runtime-service.js', () => ({
    getActRuntimeService: vi.fn(() => ({
        registerParticipantSession,
        setParticipantSessionStatus,
    })),
}))

describe('act-session-runtime', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        parseActSessionOwnershipOwnerId.mockReturnValue({
            actId: 'act-1',
            threadId: 'thread-1',
            participantKey: 'participant-1',
        })
    })

    it('registers participant sessions from the canonical act owner id', async () => {
        const { registerActParticipantSession } = await import('./act-session-runtime.js')

        await expect(registerActParticipantSession(
            '/tmp/workspace',
            'act:act-1:thread:thread-1:participant:participant-1',
            'session-1',
        )).resolves.toBe(true)

        expect(parseActSessionOwnershipOwnerId).toHaveBeenCalledWith(
            'act:act-1:thread:thread-1:participant:participant-1',
        )
        expect(registerParticipantSession).toHaveBeenCalledWith('thread-1', 'participant-1', 'session-1')
    })

    it('resolves and syncs act participant status from session ownership', async () => {
        resolveSessionOwnership.mockResolvedValue({
            ownerKind: 'act',
            ownerId: 'act:act-1:thread:thread-1:participant:participant-1',
            workingDir: '/tmp/workspace',
        })

        const {
            resolveActSessionTarget,
            syncActParticipantStatusForSession,
        } = await import('./act-session-runtime.js')

        await expect(resolveActSessionTarget('session-1')).resolves.toEqual({
            sessionId: 'session-1',
            ownerId: 'act:act-1:thread:thread-1:participant:participant-1',
            workingDir: '/tmp/workspace',
            actId: 'act-1',
            threadId: 'thread-1',
            participantKey: 'participant-1',
        })

        await expect(syncActParticipantStatusForSession('session-1', {
            type: 'idle',
        })).resolves.toBe(true)

        expect(registerParticipantSession).toHaveBeenCalledWith('thread-1', 'participant-1', 'session-1')
        expect(setParticipantSessionStatus).toHaveBeenCalledWith('thread-1', 'participant-1', {
            type: 'idle',
        })
    })
})
