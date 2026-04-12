import {
    cloneSessionExecutionContext,
    listSessionExecutionContextsForWorkingDir,
    parseActSessionOwnerId,
    registerSessionExecutionContext,
    resolveSessionExecutionContext,
    unregisterSessionExecutionContext,
    updateSessionExecutionContext,
    type SessionExecutionContext,
    type SessionOwnerKind,
} from '../lib/session-execution.js'

export type SessionOwnershipRecord = SessionExecutionContext
export type SessionOwnershipKind = SessionOwnerKind

export async function createSessionOwnership(
    context: Omit<SessionExecutionContext, 'updatedAt'>,
) {
    await registerSessionExecutionContext(context)
}

export async function cloneSessionOwnership(sourceSessionId: string, targetSessionId: string) {
    return cloneSessionExecutionContext(sourceSessionId, targetSessionId)
}

export async function resolveSessionOwnership(sessionId: string) {
    return resolveSessionExecutionContext(sessionId)
}

export async function deleteSessionOwnership(sessionId: string) {
    await unregisterSessionExecutionContext(sessionId)
}

export async function listSessionOwnershipsForWorkingDir(
    workingDir: string,
    ownerKind?: SessionOwnerKind,
) {
    return listSessionExecutionContextsForWorkingDir(workingDir, ownerKind)
}

export function parseActSessionOwnershipOwnerId(ownerId: string) {
    return parseActSessionOwnerId(ownerId)
}

export async function setSessionSidebarTitle(
    sessionId: string,
    sidebarTitle: string,
    options?: { ifUnset?: boolean },
) {
    const trimmed = sidebarTitle.trim()
    if (!trimmed) {
        return null
    }

    return updateSessionExecutionContext(sessionId, (current) => {
        if (options?.ifUnset && current.sidebarTitle?.trim()) {
            return current
        }
        return {
            ...current,
            sidebarTitle: trimmed,
        }
    })
}
