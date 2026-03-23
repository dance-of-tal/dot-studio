/**
 * Assistant slice — minimal UI state only.
 *
 * The assistant is a runtime-only chat target keyed by `studio-assistant`.
 * All chat logic (session, sending, streaming) is delegated to chatSlice.
 *
 * This slice only manages:
 *   - isAssistantOpen (sidebar toggle)
 *   - assistantModel (selected runtime model)
 *   - appliedAssistantActionMessageIds (dedupe applied action blocks)
 */
import type { StateCreator } from 'zustand'
import type { StudioState, AssistantSlice } from './types'

export const ASSISTANT_PERFORMER_ID = 'studio-assistant'

export const createAssistantSlice: StateCreator<StudioState, [], [], AssistantSlice> = (set) => ({
    isAssistantOpen: false,
    assistantModel: null,
    assistantAvailableModels: [],
    appliedAssistantActionMessageIds: {},
    assistantActionResults: {},

    toggleAssistant: () => {
        set((state) => ({ isAssistantOpen: !state.isAssistantOpen }))
    },

    setAssistantModel: (model) => set({ assistantModel: model }),

    setAssistantAvailableModels: (models) => set({ assistantAvailableModels: models }),

    markAssistantActionsApplied: (messageId) => set((state) => ({
        appliedAssistantActionMessageIds: {
            ...state.appliedAssistantActionMessageIds,
            [messageId]: true,
        },
    })),

    recordAssistantActionResult: (messageId, result) => set((state) => ({
        assistantActionResults: {
            ...state.assistantActionResults,
            [messageId]: result,
        },
    })),

    resetAssistantRuntimeState: () => set({
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
    }),
})
