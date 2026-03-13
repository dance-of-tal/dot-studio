import type { StateCreator } from 'zustand'
import type { SafeModeSlice, StudioState } from './types'
import { api } from '../api'
import { showToast } from '../lib/toast'

function ownerKey(ownerKind: 'performer' | 'act', ownerId: string) {
    return `${ownerKind}:${ownerId}`
}

function withUpdatedSummary(
    state: StudioState,
    ownerKind: 'performer' | 'act',
    ownerId: string,
    summary: Awaited<ReturnType<typeof api.safe.summary>>,
) {
    return {
        safeSummaries: {
            ...state.safeSummaries,
            [ownerKey(ownerKind, ownerId)]: summary,
        },
    }
}

export const createSafeModeSlice: StateCreator<
    StudioState,
    [],
    [],
    SafeModeSlice
> = (set) => ({
    safeSummaries: {},

    refreshSafeOwner: async (ownerKind, ownerId) => {
        try {
            const summary = await api.safe.summary(ownerKind, ownerId)
            set((state) => withUpdatedSummary(state, ownerKind, ownerId, summary))
            return summary
        } catch (error) {
            showToast(`Failed to load safe mode changes: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error', {
                title: 'Safe mode unavailable',
                dedupeKey: `safe:${ownerKind}:${ownerId}:summary`,
            })
            return null
        }
    },

    clearSafeOwner: (ownerKind, ownerId) => {
        set((state) => {
            const next = { ...state.safeSummaries }
            delete next[ownerKey(ownerKind, ownerId)]
            return { safeSummaries: next }
        })
    },

    applySafeOwner: async (ownerKind, ownerId) => {
        const summary = await api.safe.apply(ownerKind, ownerId)
        set((state) => withUpdatedSummary(state, ownerKind, ownerId, summary))
    },

    discardSafeOwnerFile: async (ownerKind, ownerId, filePath) => {
        const summary = await api.safe.discardFile(ownerKind, ownerId, filePath)
        set((state) => withUpdatedSummary(state, ownerKind, ownerId, summary))
    },

    discardAllSafeOwner: async (ownerKind, ownerId) => {
        const summary = await api.safe.discardAll(ownerKind, ownerId)
        set((state) => withUpdatedSummary(state, ownerKind, ownerId, summary))
    },

    undoLastSafeApply: async (ownerKind, ownerId) => {
        const summary = await api.safe.undoLastApply(ownerKind, ownerId)
        set((state) => withUpdatedSummary(state, ownerKind, ownerId, summary))
    },
})
