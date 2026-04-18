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
 *   - appliedAssistantActionMessageIds (dedupe applied assistant mutation messages)
 */
import type { StateCreator } from 'zustand'
import type { StudioState, AssistantSlice } from './types'
import {
    ASSISTANT_CHAT_OWNER_ID,
    buildAssistantChatKey,
    isAssistantChatKey,
} from '../../shared/chat-targets'

export const ASSISTANT_PERFORMER_ID = ASSISTANT_CHAT_OWNER_ID
export { buildAssistantChatKey, isAssistantChatKey }

function sameAssistantModel(
    left: StudioState['assistantModel'],
    right: StudioState['assistantModel'],
) {
    if (left === right) return true
    if (!left || !right) return left === right
    return left.provider === right.provider && left.modelId === right.modelId
}

function sameAvailableModels(
    left: StudioState['assistantAvailableModels'],
    right: StudioState['assistantAvailableModels'],
) {
    if (left === right) return true
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
        const current = left[index]
        const next = right[index]
        if (
            current.provider !== next.provider
            || current.providerName !== next.providerName
            || current.modelId !== next.modelId
            || current.name !== next.name
        ) {
            return false
        }
        const currentVariants = current.variants || []
        const nextVariants = next.variants || []
        if (currentVariants.length !== nextVariants.length) {
            return false
        }
        for (let variantIndex = 0; variantIndex < currentVariants.length; variantIndex += 1) {
            if (
                currentVariants[variantIndex].id !== nextVariants[variantIndex].id
                || currentVariants[variantIndex].summary !== nextVariants[variantIndex].summary
            ) {
                return false
            }
        }
    }
    return true
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

    setAssistantModel: (model) => set((state) => (
        sameAssistantModel(state.assistantModel, model)
            ? state
            : {
                assistantModel: model,
                workspaceDirty: true,
            }
    )),

    setAssistantAvailableModels: (models) => set((state) => (
        sameAvailableModels(state.assistantAvailableModels, models)
            ? state
            : { assistantAvailableModels: models }
    )),

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
