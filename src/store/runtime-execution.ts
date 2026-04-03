import type { AssetRef } from '../types'
import type { StudioState } from './types'
import { hasRunningStudioSessions } from './runtime-reload-utils'

type GetState = () => StudioState

export type PreparedRuntimeResult = {
    appliedReload: boolean
    requiresDispose: boolean
    blocked: boolean
    reason: 'runtime_reload' | 'projection_update_pending' | 'running_session' | null
}

function collectDraftIds(talRef: AssetRef | null | undefined, danceRefs: AssetRef[] | null | undefined) {
    const ids = new Set<string>()
    if (talRef?.kind === 'draft') {
        ids.add(talRef.draftId)
    }
    for (const ref of danceRefs || []) {
        if (ref.kind === 'draft') {
            ids.add(ref.draftId)
        }
    }
    return Array.from(ids)
}

export function collectRuntimeDraftIds(
    runtimeConfig: {
        talRef: AssetRef | null
        danceRefs: AssetRef[]
    },
) {
    return collectDraftIds(runtimeConfig.talRef, runtimeConfig.danceRefs)
}

function projectionDirtyAffectsTarget(
    state: Pick<StudioState, 'projectionDirty'>,
    options: {
        performerId?: string | null
        actId?: string | null
        runtimeConfig: {
            talRef: AssetRef | null
            danceRefs: AssetRef[]
        }
    },
) {
    if (state.projectionDirty.workspaceWide) {
        return true
    }
    if (options.performerId && state.projectionDirty.performerIds.includes(options.performerId)) {
        return true
    }
    if (options.actId && state.projectionDirty.actIds.includes(options.actId)) {
        return true
    }
    const runtimeDraftIds = collectRuntimeDraftIds(options.runtimeConfig)
    return runtimeDraftIds.some((draftId) => state.projectionDirty.draftIds.includes(draftId))
}

export async function preparePendingRuntimeExecution(
    get: GetState,
    options: {
        performerId?: string | null
        actId?: string | null
        runtimeConfig: {
            talRef: AssetRef | null
            danceRefs: AssetRef[]
        }
    },
): Promise<PreparedRuntimeResult> {
    let appliedReload = false

    if (get().runtimeReloadPending) {
        appliedReload = await get().applyPendingRuntimeReload()
        if (!appliedReload && get().runtimeReloadPending) {
            return {
                appliedReload,
                requiresDispose: false,
                blocked: true,
                reason: 'runtime_reload',
            }
        }
    }

    const state = get()
    const requiresDispose = projectionDirtyAffectsTarget(state, options)

    if (requiresDispose && state.workspaceDirty) {
        await state.saveWorkspace()
    }

    const hasRunningConflict = hasRunningStudioSessions(state)

    if (requiresDispose && hasRunningConflict) {
        return {
            appliedReload,
            requiresDispose,
            blocked: true,
            reason: 'projection_update_pending',
        }
    }

    return {
        appliedReload,
        requiresDispose,
        blocked: false,
        reason: null,
    }
}
