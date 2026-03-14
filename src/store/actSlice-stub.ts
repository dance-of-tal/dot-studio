// actSlice-stub.ts — Temporary no-op stub for legacy Act actions
// Will be replaced by PerformerRelation model in Phase 2b
import type { StateCreator } from 'zustand'
import type { StudioState, WorkspaceSlice } from './types'

// Minimal ID generation utility (was previously in lib/acts.ts)
export function makeId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// Stub act actions — all no-ops
export function createActActions(
    _set: Parameters<StateCreator<StudioState, [], [], WorkspaceSlice>>[0],
    _get: Parameters<StateCreator<StudioState, [], [], WorkspaceSlice>>[1],
    _performerIdCounter: { value: number },
) {
    return {
        addAct: () => { console.warn('[studio] addAct: removed (Phase 2 pending)') },
        importActFromAsset: async () => { console.warn('[studio] importActFromAsset: removed (Phase 2 pending)') },
        removeAct: () => { console.warn('[studio] removeAct: removed (Phase 2 pending)') },
        updateActMeta: () => { console.warn('[studio] updateActMeta: removed (Phase 2 pending)') },
        updateActAuthoringMeta: () => { console.warn('[studio] updateActAuthoringMeta: removed (Phase 2 pending)') },
        updateActBounds: () => { console.warn('[studio] updateActBounds: removed (Phase 2 pending)') },
        addActNode: () => { console.warn('[studio] addActNode: removed (Phase 2 pending)') },
        addPerformerAssetToAct: () => { console.warn('[studio] addPerformerAssetToAct: removed (Phase 2 pending)') },
        createActOwnedPerformerForNode: () => { console.warn('[studio] createActOwnedPerformerForNode: removed (Phase 2 pending)'); return null },
        updateActNode: () => { console.warn('[studio] updateActNode: removed (Phase 2 pending)') },
        updateActNodePosition: () => { console.warn('[studio] updateActNodePosition: removed (Phase 2 pending)') },
        applyActAutoLayout: () => { console.warn('[studio] applyActAutoLayout: removed (Phase 2 pending)') },
        setActNodeType: () => { console.warn('[studio] setActNodeType: removed (Phase 2 pending)') },
        removeActNode: () => { console.warn('[studio] removeActNode: removed (Phase 2 pending)') },
        addActEdge: () => { console.warn('[studio] addActEdge: removed (Phase 2 pending)') },
        updateActEdge: () => { console.warn('[studio] updateActEdge: removed (Phase 2 pending)') },
        removeActEdge: () => { console.warn('[studio] removeActEdge: removed (Phase 2 pending)') },
    }
}
