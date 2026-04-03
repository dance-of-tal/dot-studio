// Cascade cleanup utilities for asset deletion (draft, installed, and canvas performer).
// Pure functions that compute state patches for orphan-reference cleanup.

import type { AssetRef, PerformerNode, WorkspaceAct } from '../types'

/** Deletion target — either a draft (by draftId) or a registry asset (by URN). */
export type DeleteTarget =
    | { kind: 'draft'; draftId: string }
    | { kind: 'registry'; urn: string }

/** Check if an AssetRef points to the deletion target. */
function matchesDeleteTarget(ref: AssetRef, target: DeleteTarget): boolean {
    if (target.kind === 'draft') {
        return ref.kind === 'draft' && ref.draftId === target.draftId
    }
    return ref.kind === 'registry' && ref.urn === target.urn
}

/** Remove participant keys matching a predicate from an Act, along with related relations. */
function removeActParticipants(
    act: WorkspaceAct,
    shouldRemove: (key: string, binding: WorkspaceAct['participants'][string]) => boolean,
): WorkspaceAct {
    const removedKeys: string[] = []
    for (const [key, binding] of Object.entries(act.participants)) {
        if (shouldRemove(key, binding)) removedKeys.push(key)
    }
    if (removedKeys.length === 0) return act

    const participants = { ...act.participants }
    for (const key of removedKeys) delete participants[key]
    const removedSet = new Set(removedKeys)
    const relations = act.relations.filter(
        (r) => !r.between.some((k) => removedSet.has(k)),
    )
    return { ...act, participants, relations }
}

/**
 * Build a state patch that cleans up orphan references after an asset is deleted.
 * Unified handler for both draft and registry (installed) assets.
 */
export function buildAssetDeleteCascade(
    assetKind: string,
    target: DeleteTarget,
    performers: PerformerNode[],
    acts: WorkspaceAct[],
): { performers?: PerformerNode[]; acts?: WorkspaceAct[]; workspaceDirty?: boolean } {
    if (assetKind === 'tal') {
        const updated = performers.map((p) =>
            p.talRef && matchesDeleteTarget(p.talRef, target)
                ? { ...p, talRef: null }
                : p,
        )
        if (updated.some((p, i) => p !== performers[i])) {
            return { performers: updated, workspaceDirty: true }
        }
        return {}
    }

    if (assetKind === 'dance') {
        const updated = performers.map((p) => {
            const filtered = p.danceRefs.filter(
                (ref) => !matchesDeleteTarget(ref, target),
            )
            return filtered.length !== p.danceRefs.length
                ? { ...p, danceRefs: filtered }
                : p
        })
        if (updated.some((p, i) => p !== performers[i])) {
            return { performers: updated, workspaceDirty: true }
        }
        return {}
    }

    if (assetKind === 'performer') {
        const updated = acts.map((act) =>
            removeActParticipants(act, (_key, binding) =>
                matchesDeleteTarget(binding.performerRef, target),
            ),
        )
        if (updated.some((a, i) => a !== acts[i])) {
            return { acts: updated, workspaceDirty: true }
        }
        return {}
    }

    // kind === 'act' → no cascade needed (act assets are independent copies)
    return {}
}

/**
 * Convenience wrapper for draft deletion.
 * Delegates to buildAssetDeleteCascade with a draft target.
 */
export function buildDraftDeleteCascade(
    kind: string,
    draftId: string,
    performers: PerformerNode[],
    acts: WorkspaceAct[],
) {
    return buildAssetDeleteCascade(kind, { kind: 'draft', draftId }, performers, acts)
}

/**
 * Convenience wrapper for installed (registry) asset uninstall.
 * Delegates to buildAssetDeleteCascade with a registry target.
 */
export function buildInstalledDeleteCascade(
    assetKind: string,
    urn: string,
    performers: PerformerNode[],
    acts: WorkspaceAct[],
) {
    return buildAssetDeleteCascade(assetKind, { kind: 'registry', urn }, performers, acts)
}

/**
 * Build a state patch that cleans up Act references after a canvas performer is deleted.
 * Act participant refs can point to either the live performer id or a linked draft id.
 */
export function buildPerformerDeleteCascade(
    performer: Pick<PerformerNode, 'id' | 'meta'>,
    acts: WorkspaceAct[],
): { acts?: WorkspaceAct[]; workspaceDirty?: boolean } {
    const draftIds = new Set<string>([performer.id])
    const derivedFrom = performer.meta?.derivedFrom?.trim()
    if (derivedFrom?.startsWith('draft:')) {
        draftIds.add(derivedFrom.slice('draft:'.length))
    }

    const updated = acts.map((act) =>
        removeActParticipants(act, (_key, binding) =>
            binding.performerRef.kind === 'draft' && draftIds.has(binding.performerRef.draftId),
        ),
    )
    if (updated.some((a, i) => a !== acts[i])) {
        return { acts: updated, workspaceDirty: true }
    }
    return {}
}
