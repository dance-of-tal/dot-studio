export interface ProjectionDirtyPatch {
    performerIds?: string[]
    actIds?: string[]
    draftIds?: string[]
    workspaceWide?: boolean
}

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)))
}

export function normalizeProjectionDirtyPatch(
    patch?: ProjectionDirtyPatch | null,
): ProjectionDirtyPatch {
    if (!patch) {
        return {}
    }

    const performerIds = unique(patch.performerIds || [])
    const actIds = unique(patch.actIds || [])
    const draftIds = unique(patch.draftIds || [])

    return {
        ...(performerIds.length > 0 ? { performerIds } : {}),
        ...(actIds.length > 0 ? { actIds } : {}),
        ...(draftIds.length > 0 ? { draftIds } : {}),
        ...(patch.workspaceWide === true ? { workspaceWide: true } : {}),
    }
}

export function mergeProjectionDirtyPatches(
    ...patches: Array<ProjectionDirtyPatch | null | undefined>
): ProjectionDirtyPatch {
    return normalizeProjectionDirtyPatch({
        performerIds: patches.flatMap((patch) => patch?.performerIds || []),
        actIds: patches.flatMap((patch) => patch?.actIds || []),
        draftIds: patches.flatMap((patch) => patch?.draftIds || []),
        workspaceWide: patches.some((patch) => patch?.workspaceWide === true),
    })
}

export function projectionDirtyPatchHasAny(
    patch?: ProjectionDirtyPatch | null,
) {
    const normalized = normalizeProjectionDirtyPatch(patch)
    return normalized.workspaceWide === true
        || (normalized.performerIds?.length || 0) > 0
        || (normalized.actIds?.length || 0) > 0
        || (normalized.draftIds?.length || 0) > 0
}
