// DOT Studio — Performer Relation Slice
// Stand-alone edges have been removed. Edges now live inside Act.relations.
// This slice is kept as an empty shell to satisfy StudioState composition.

import type { StateCreator } from 'zustand'
import type { StudioState, PerformerRelationSlice } from './types'

export const createPerformerRelationSlice: StateCreator<
    StudioState,
    [],
    [],
    PerformerRelationSlice
> = (_set, _get) => ({
    // No-op: edges are managed by actSlice via Act.relations
})
