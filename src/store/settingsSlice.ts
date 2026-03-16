/**
 * UI Settings store — lightweight Zustand store persisted to localStorage.
 * Mirrors OpenCode desktop's settings context (context/settings.tsx).
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FollowupBehavior = 'queue' | 'steer'

export interface UISettings {
    showReasoningSummaries: boolean
    shellToolPartsExpanded: boolean
    editToolPartsExpanded: boolean
    followup: FollowupBehavior
}

interface UISettingsStore extends UISettings {
    setShowReasoningSummaries: (value: boolean) => void
    setShellToolPartsExpanded: (value: boolean) => void
    setEditToolPartsExpanded: (value: boolean) => void
    setFollowup: (value: FollowupBehavior) => void
}

const defaults: UISettings = {
    showReasoningSummaries: false,
    shellToolPartsExpanded: true,
    editToolPartsExpanded: false,
    followup: 'steer',
}

export const useUISettings = create<UISettingsStore>()(
    persist(
        (set) => ({
            ...defaults,
            setShowReasoningSummaries: (value) => set({ showReasoningSummaries: value }),
            setShellToolPartsExpanded: (value) => set({ shellToolPartsExpanded: value }),
            setEditToolPartsExpanded: (value) => set({ editToolPartsExpanded: value }),
            setFollowup: (value) => set({ followup: value }),
        }),
        { name: 'dot-studio-ui-settings' },
    ),
)
