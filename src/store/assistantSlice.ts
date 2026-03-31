/**
 * Assistant slice — minimal UI state only.
 *
 * The assistant is a runtime-only chat target keyed by a workspace-scoped
 * chat key derived from `studio-assistant`.
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

function hashWorkspaceKey(input: string) {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
}

export function buildAssistantChatKey(workingDir: string | null | undefined) {
    const normalized = workingDir?.trim()
    if (!normalized) {
        return ASSISTANT_PERFORMER_ID
    }
    return `${ASSISTANT_PERFORMER_ID}--${hashWorkspaceKey(normalized)}`
}

export function isAssistantChatKey(performerId: string) {
    return performerId === ASSISTANT_PERFORMER_ID || performerId.startsWith(`${ASSISTANT_PERFORMER_ID}--`)
}

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
