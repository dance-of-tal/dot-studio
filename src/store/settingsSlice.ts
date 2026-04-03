/**
 * UI Settings store — lightweight Zustand store persisted to localStorage.
 * Mirrors OpenCode desktop's settings context (context/settings.tsx).
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UISettings {
    showReasoningSummaries: boolean
    shellToolPartsExpanded: boolean
    editToolPartsExpanded: boolean
}

interface UISettingsStore extends UISettings {
    setShowReasoningSummaries: (value: boolean) => void
    setShellToolPartsExpanded: (value: boolean) => void
    setEditToolPartsExpanded: (value: boolean) => void
}

const defaults: UISettings = {
    showReasoningSummaries: true,
    shellToolPartsExpanded: true,
    editToolPartsExpanded: false,
}

export function migrateUISettings(persistedState: unknown): UISettings {
    const record = (persistedState && typeof persistedState === 'object')
        ? persistedState as Partial<UISettingsStore> & { followup?: unknown; setFollowup?: unknown }
        : {}
    const rest = Object.fromEntries(
        Object.entries(record).filter(([key]) => key !== 'followup' && key !== 'setFollowup'),
    ) as Partial<UISettingsStore>

    return {
        ...defaults,
        ...rest,
        // This toggle existed before it was actually wired into chat rendering.
        // Reset legacy installs to the new visible-by-default behavior.
        showReasoningSummaries: true,
    }
}

export const useUISettings = create<UISettingsStore>()(
    persist(
        (set) => ({
            ...defaults,
            setShowReasoningSummaries: (value) => set({ showReasoningSummaries: value }),
            setShellToolPartsExpanded: (value) => set({ shellToolPartsExpanded: value }),
            setEditToolPartsExpanded: (value) => set({ editToolPartsExpanded: value }),
        }),
        {
            name: 'dot-studio-ui-settings',
            version: 3,
            migrate: migrateUISettings,
        },
    ),
)
