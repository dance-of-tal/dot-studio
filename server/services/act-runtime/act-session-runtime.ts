import type { ActParticipantSessionStatus } from '../../../shared/act-types.js'
import {
    parseActSessionOwnershipOwnerId,
    resolveSessionOwnership,
} from '../session-ownership-service.js'
import { getActRuntimeService } from './act-runtime-service.js'

export type ActParticipantSessionRuntimeStatus = Pick<ActParticipantSessionStatus, 'type' | 'message'>

export type ActSessionTarget = {
    sessionId: string
    ownerId: string
    workingDir: string
    actId: string
    threadId: string
    participantKey: string
}

export function parseActParticipantSessionOwner(ownerId: string) {
    return parseActSessionOwnershipOwnerId(ownerId)
}

export async function resolveActSessionTarget(sessionId: string): Promise<ActSessionTarget | null> {
    const context = await resolveSessionOwnership(sessionId)
    if (!context || context.ownerKind !== 'act') {
        return null
    }

    const parsed = parseActParticipantSessionOwner(context.ownerId)
    if (!parsed) {
        return null
    }

    return {
        sessionId,
        ownerId: context.ownerId,
        workingDir: context.workingDir,
        actId: parsed.actId,
        threadId: parsed.threadId,
        participantKey: parsed.participantKey,
    }
}

export async function registerActParticipantSession(
    workingDir: string,
    ownerId: string,
    sessionId: string,
) {
    const parsed = parseActParticipantSessionOwner(ownerId)
    if (!parsed) {
        return false
    }

    const service = getActRuntimeService(workingDir)
    await service.registerParticipantSession(parsed.threadId, parsed.participantKey, sessionId)
    return true
}

export async function syncActParticipantStatusForSession(
    sessionId: string,
    status: ActParticipantSessionRuntimeStatus,
) {
    const target = await resolveActSessionTarget(sessionId)
    if (!target) {
        return false
    }

    const service = getActRuntimeService(target.workingDir)
    await service.registerParticipantSession(target.threadId, target.participantKey, sessionId)
    await service.setParticipantSessionStatus(target.threadId, target.participantKey, status)
    return true
}
