import type { ProjectionDirtyPatch } from '../../shared/projection-dirty.js'

type RuntimeExecutionStreamEvent = {
    type: 'runtime.projection.consumed'
    properties: {
        patch: ProjectionDirtyPatch
    }
}

type Listener = (event: RuntimeExecutionStreamEvent) => void

const listenersByWorkingDir = new Map<string, Set<Listener>>()

function clonePatch(patch: ProjectionDirtyPatch): ProjectionDirtyPatch {
    return {
        ...(patch.performerIds ? { performerIds: [...patch.performerIds] } : {}),
        ...(patch.actIds ? { actIds: [...patch.actIds] } : {}),
        ...(patch.draftIds ? { draftIds: [...patch.draftIds] } : {}),
        ...(patch.workspaceWide === true ? { workspaceWide: true } : {}),
    }
}

function publish(workingDir: string, event: RuntimeExecutionStreamEvent) {
    const listeners = listenersByWorkingDir.get(workingDir)
    if (!listeners || listeners.size === 0) {
        return
    }

    for (const listener of listeners) {
        listener(event)
    }
}

export function publishProjectionConsumed(workingDir: string, patch: ProjectionDirtyPatch) {
    publish(workingDir, {
        type: 'runtime.projection.consumed',
        properties: {
            patch: clonePatch(patch),
        },
    })
}

export function subscribeRuntimeExecutionEvents(workingDir: string, listener: Listener) {
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
