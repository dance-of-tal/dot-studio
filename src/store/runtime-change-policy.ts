import type { AssetRef } from '../types'

export type RuntimeChangeClass = 'hot' | 'lazy_projection' | 'runtime_reload'

export interface ProjectionDirtyState {
    performerIds: string[]
    actIds: string[]
    draftIds: string[]
    workspaceWide: boolean
}

export type StudioChangeDescriptor =
    | {
        kind: 'ui'
    }
    | {
        kind: 'performer'
        performerIds?: string[]
        draftIds?: string[]
        workspaceWide?: boolean
    }
    | {
        kind: 'act'
        actIds?: string[]
        performerIds?: string[]
        draftIds?: string[]
        workspaceWide?: boolean
    }
    | {
        kind: 'draft'
        draftIds?: string[]
        performerIds?: string[]
        actIds?: string[]
        workspaceWide?: boolean
    }
    | {
        kind: 'runtime_config'
    }

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)))
}

export function createEmptyProjectionDirtyState(): ProjectionDirtyState {
    return {
        performerIds: [],
        actIds: [],
        draftIds: [],
        workspaceWide: false,
    }
}

export function classifyStudioChange(change: StudioChangeDescriptor): RuntimeChangeClass {
    switch (change.kind) {
        case 'ui':
            return 'hot'
        case 'runtime_config':
            return 'runtime_reload'
        case 'performer':
        case 'act':
        case 'draft':
            return 'lazy_projection'
    }
}

export function isRuntimeAffectingChange(change: StudioChangeDescriptor) {
    return classifyStudioChange(change) !== 'hot'
}

export function mergeProjectionDirtyState(
    current: ProjectionDirtyState,
    change: Extract<StudioChangeDescriptor, { kind: 'performer' | 'act' | 'draft' }>,
): ProjectionDirtyState {
    const actIds = 'actIds' in change ? change.actIds : undefined
    return {
        performerIds: unique([...current.performerIds, ...(change.performerIds || [])]),
        actIds: unique([...current.actIds, ...(actIds || [])]),
        draftIds: unique([...current.draftIds, ...(change.draftIds || [])]),
        workspaceWide: current.workspaceWide || change.workspaceWide === true,
    }
}

export function clearProjectionDirtyState(
    current: ProjectionDirtyState,
    patch?: Partial<ProjectionDirtyState> | null,
): ProjectionDirtyState {
    if (!patch) {
        return createEmptyProjectionDirtyState()
    }

    const performerIds = new Set(patch.performerIds || [])
    const actIds = new Set(patch.actIds || [])
    const draftIds = new Set(patch.draftIds || [])

    return {
        performerIds: current.performerIds.filter((id) => !performerIds.has(id)),
        actIds: current.actIds.filter((id) => !actIds.has(id)),
        draftIds: current.draftIds.filter((id) => !draftIds.has(id)),
        workspaceWide: patch.workspaceWide ? false : current.workspaceWide,
    }
}

export function projectionDirtyHasAny(state: ProjectionDirtyState) {
    return state.workspaceWide
        || state.performerIds.length > 0
        || state.actIds.length > 0
        || state.draftIds.length > 0
}

export function draftIdsFromAssetRefs(refs: AssetRef[] | null | undefined) {
    return unique((refs || []).map((ref) => ref.kind === 'draft' ? ref.draftId : null))
}

export function draftIdsFromRuntimeRefs(talRef: AssetRef | null | undefined, danceRefs: AssetRef[] | null | undefined) {
    return unique([
        talRef?.kind === 'draft' ? talRef.draftId : null,
        ...draftIdsFromAssetRefs(danceRefs),
    ])
}
