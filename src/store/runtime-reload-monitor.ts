import type { StoreApi, UseBoundStore } from 'zustand'
import type { StudioState } from './types'
import { buildRuntimeReloadSignature } from './runtime-reload-utils'

export function initRuntimeReloadMonitor(store: UseBoundStore<StoreApi<StudioState>>) {
    store.subscribe((state, previous) => {
        if (!state.workingDir || state.workingDir !== previous.workingDir) {
            return
        }

        if (!state.workspaceDirty) {
            return
        }

        const previousSignature = buildRuntimeReloadSignature(previous)
        const nextSignature = buildRuntimeReloadSignature(state)
        if (previousSignature === nextSignature) {
            return
        }

        store.getState().markRuntimeReloadPending()
    })
}
