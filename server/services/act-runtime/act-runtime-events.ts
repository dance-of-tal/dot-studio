import type { ActThreadSummary } from '../../../shared/act-types.js'

type ActRuntimeStreamEvent =
    | {
        type: 'act.thread.updated'
        properties: {
            thread: ActThreadSummary
        }
    }
    | {
        type: 'act.thread.deleted'
        properties: {
            actId: string
            threadId: string
        }
    }

type Listener = (event: ActRuntimeStreamEvent) => void

const listenersByWorkingDir = new Map<string, Set<Listener>>()

function cloneThreadSummary(thread: ActThreadSummary): ActThreadSummary {
    return {
        id: thread.id,
        actId: thread.actId,
        participantSessions: { ...thread.participantSessions },
        participantStatuses: Object.fromEntries(
            Object.entries(thread.participantStatuses || {}).map(([participantKey, status]) => [participantKey, { ...status }]),
        ),
        createdAt: thread.createdAt,
        status: thread.status,
    }
}

function publish(workingDir: string, event: ActRuntimeStreamEvent) {
    const listeners = listenersByWorkingDir.get(workingDir)
    if (!listeners || listeners.size === 0) {
        return
    }

    for (const listener of listeners) {
        listener(event)
    }
}

export function publishActThreadUpdated(workingDir: string, thread: ActThreadSummary) {
    publish(workingDir, {
        type: 'act.thread.updated',
        properties: {
            thread: cloneThreadSummary(thread),
        },
    })
}

export function publishActThreadDeleted(workingDir: string, actId: string, threadId: string) {
    publish(workingDir, {
        type: 'act.thread.deleted',
        properties: {
            actId,
            threadId,
        },
    })
}

export function subscribeActRuntimeEvents(workingDir: string, listener: Listener) {
    const listeners = listenersByWorkingDir.get(workingDir) || new Set<Listener>()
    listeners.add(listener)
    listenersByWorkingDir.set(workingDir, listeners)

    return () => {
        const current = listenersByWorkingDir.get(workingDir)
        if (!current) {
            return
        }
        current.delete(listener)
        if (current.size === 0) {
            listenersByWorkingDir.delete(workingDir)
        }
    }
}
