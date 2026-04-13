import type { SharedAssetRef } from '../../../shared/chat-contracts.js'
import { normalizeProjectionDirtyPatch, type ProjectionDirtyPatch } from '../../../shared/projection-dirty.js'

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)))
}

function draftIdsFromRuntimeRefs(
    talRef: SharedAssetRef | null | undefined,
    danceRefs: SharedAssetRef[] | null | undefined,
) {
    return unique([
        talRef?.kind === 'draft' ? talRef.draftId : null,
        ...((danceRefs || []).map((ref) => ref.kind === 'draft' ? ref.draftId : null)),
    ])
}

export function buildProjectionDirtyPatch(input: {
    performerId?: string | null
    actId?: string | null
    talRef: SharedAssetRef | null | undefined
    danceRefs: SharedAssetRef[] | null | undefined
}): ProjectionDirtyPatch {
    return normalizeProjectionDirtyPatch({
        performerIds: unique([input.performerId]),
        actIds: unique([input.actId]),
        draftIds: draftIdsFromRuntimeRefs(input.talRef, input.danceRefs),
    })
}
