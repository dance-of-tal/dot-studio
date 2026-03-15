import type { StateCreator } from 'zustand'
import type { StudioState, PerformerRelationSlice } from './types'
import { makeId } from '../lib/acts'

const genEdgeId = () => makeId('edge')

export const createPerformerRelationSlice: StateCreator<
    StudioState,
    [],
    [],
    PerformerRelationSlice
> = (set) => ({
    edges: [],

    addEdge: (from, to) => set((state) => ({
        edges: [...state.edges, { id: genEdgeId(), from, to, interaction: 'request', description: '' }],
        stageDirty: true,
    })),

    removeEdge: (id) => set((state) => ({
        edges: state.edges.filter((edge) => edge.id !== id),
        stageDirty: true,
    })),

    updateEdgeDescription: (id, description) => set((state) => ({
        edges: state.edges.map((edge) => edge.id === id ? { ...edge, description } : edge),
        stageDirty: true,
    })),
})
