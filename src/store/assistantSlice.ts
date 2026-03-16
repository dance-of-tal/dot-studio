import type { StateCreator } from 'zustand'
import type { StudioState, AssistantSlice } from './types'

export const createAssistantSlice: StateCreator<StudioState, [], [], AssistantSlice> = (set, get) => ({
    isAssistantOpen: false,
    assistantMessages: [],
    assistantSessionId: null,

    toggleAssistant: () => {
        set((state) => ({ isAssistantOpen: !state.isAssistantOpen }))
    },

    sendAssistantMessage: async (message: string, model?: string) => {
        // Optimistic UI update
        const userMsg = {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: message,
            timestamp: Date.now(),
        }

        let currentSessionId = get().assistantSessionId
        
        // Ensure session exists
        if (!currentSessionId) {
            try {
                const res = await fetch('/api/assistant/session', {
                    method: 'POST',
                })
                const data = await res.json()
                if (data.sessionId) {
                    currentSessionId = data.sessionId
                    set({ assistantSessionId: currentSessionId })
                }
            } catch (err) {
                console.error('Failed to create assistant session:', err)
                return
            }
        }

        set((state) => ({
            assistantMessages: [...state.assistantMessages, userMsg]
        }))

        // Capture canvas context
        const state = get()
        const canvasContext = {
            performers: state.performers.map(p => ({
                id: p.id,
                name: p.name,
                hasTal: !!p.talRef,
                model: p.model ? typeof p.model === 'string' ? p.model : p.model.modelId : null
            })),
            acts: state.acts.map(a => ({
                id: a.id,
                name: a.name,
                performerCount: Object.keys(a.performers).length
            })),
            selectedPerformerId: state.selectedPerformerId
        }

        // Send to API
        try {
            await fetch('/api/assistant/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    message,
                    canvasContext,
                    model,
                }),
            })
        } catch (err) {
            console.error('Failed to send assistant message:', err)
        }
    },

    clearAssistantHistory: () => {
        set({ assistantMessages: [], assistantSessionId: null })
    }
})
