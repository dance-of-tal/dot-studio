/**
 * Assistant slice — minimal UI state only.
 *
 * The assistant is treated as a hidden performer with ID 'studio-assistant'.
 * All chat logic (session, sending, streaming) is delegated to chatSlice.
 *
 * This slice only manages:
 *   - isAssistantOpen (sidebar toggle)
 *   - ensureAssistantPerformer (create/update the hidden performer node with selected model)
 */
import type { StateCreator } from 'zustand'
import type { StudioState, AssistantSlice } from './types'

export const ASSISTANT_PERFORMER_ID = 'studio-assistant'

export const createAssistantSlice: StateCreator<StudioState, [], [], AssistantSlice> = (set, get) => ({
    isAssistantOpen: false,

    toggleAssistant: () => {
        set((state) => ({ isAssistantOpen: !state.isAssistantOpen }))
    },

    ensureAssistantPerformer: (model) => {
        const state = get()
        const existing = state.performers.find((p) => p.id === ASSISTANT_PERFORMER_ID)

        if (existing) {
            // Update model if changed
            if (
                existing.model?.provider !== model.provider ||
                existing.model?.modelId !== model.modelId
            ) {
                set((s) => ({
                    performers: s.performers.map((p) =>
                        p.id === ASSISTANT_PERFORMER_ID
                            ? { ...p, model }
                            : p,
                    ),
                }))
            }
            return
        }

        // Create hidden performer node for assistant
        set((s) => ({
            performers: [
                ...s.performers,
                {
                    id: ASSISTANT_PERFORMER_ID,
                    name: 'Studio Assistant',
                    position: { x: -9999, y: -9999 },
                    width: 0,
                    height: 0,
                    scope: 'shared' as const,
                    model,
                    talRef: null,
                    danceRefs: [],
                    mcpServerNames: [],
                    mcpBindingMap: {},
                    declaredMcpConfig: null,
                    danceDeliveryMode: 'auto' as const,
                    executionMode: 'direct' as const,
                    hidden: true,
                },
            ],
        }))
    },
})
