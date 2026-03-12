import type { StateCreator } from 'zustand'
import type { AdapterViewSlice, StudioState } from './types'

export const createAdapterViewSlice: StateCreator<
    StudioState,
    [],
    [],
    AdapterViewSlice
> = (set) => ({
    adapterViewsByPerformer: {},

    upsertAdapterViewProjection: (projection) => set((state) => ({
        adapterViewsByPerformer: {
            ...state.adapterViewsByPerformer,
            [projection.performerId]: {
                ...(state.adapterViewsByPerformer[projection.performerId] || {}),
                [projection.adapterId]: projection,
            },
        },
    })),

    clearAdapterViewsForPerformer: (performerId) => set((state) => {
        const next = { ...state.adapterViewsByPerformer }
        delete next[performerId]
        return {
            adapterViewsByPerformer: next,
        }
    }),
})
