/**
 * Act chat logic extracted from chatSlice.
 */
import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import type { ChatGet, ChatSet } from './chat-internals'
import { appendPerformerSystemMessage } from './chat-internals'

export function createActChat(set: ChatSet, get: ChatGet) {
    return {
        sendActMessage: async (actId: string, callerPerformerId: string, message: string) => {
            const act = get().acts.find((a) => a.id === actId)
            if (!act) {
                return
            }

            const actPerformer = act.performers[callerPerformerId]
            if (!actPerformer || !actPerformer.model) {
                appendPerformerSystemMessage(set, get, callerPerformerId, 'Act performer has no model configured.')
                return
            }

            // Get or create Act-scoped session (OpenCode tracks agent/model/variant per-message,
            // so config changes don't require a new session)
            let sessionId = get().actSessionMap[actId]

            if (!sessionId) {
                set({ loadingPerformerId: callerPerformerId })
                try {
                    const res = await api.chat.createSession(
                        callerPerformerId,
                        actPerformer.name,
                        '',
                        act.executionMode === 'safe' ? 'safe' : 'direct',
                        actId,
                    )
                    sessionId = res.sessionId
                    set((state: any) => ({
                        actSessionMap: { ...state.actSessionMap, [actId]: sessionId },
                    }))
                } catch (err) {
                    appendPerformerSystemMessage(set, get, callerPerformerId, formatStudioApiErrorMessage(err))
                    set({ loadingPerformerId: null })
                    return
                }
            }

            // Build relation targets from Act-internal relations
            const relatedPerformers = act.relations
                .filter((r) => r.from === callerPerformerId)
                .map((r) => {
                    const target = act.performers[r.to]
                    if (!target || !target.model) return null
                    return {
                        performerId: r.to,
                        performerName: target.name,
                        description: r.description || '',
                        talRef: target.talRef,
                        danceRefs: target.danceRefs,
                        drafts: get().drafts,
                        model: target.model,
                        modelVariant: target.modelVariant,
                        mcpServerNames: target.mcpServerNames,
                    }
                })
                .filter((v): v is NonNullable<typeof v> => v !== null)

            const addActMsg = (msg: any) => set((s: any) => ({
                actChats: {
                    ...s.actChats,
                    [actId]: [...(s.actChats[actId] || []), msg],
                },
            }))

            addActMsg({
                id: Date.now().toString(),
                role: 'user',
                content: message,
                timestamp: Date.now(),
            })

            set({ loadingPerformerId: callerPerformerId })

            try {
                get().initRealtimeEvents()

                await api.chat.send(sessionId, {
                    message,
                    performer: {
                        performerId: callerPerformerId,
                        performerName: actPerformer.name,
                        talRef: actPerformer.talRef,
                        danceRefs: actPerformer.danceRefs,
                        drafts: get().drafts,
                        model: actPerformer.model,
                        modelVariant: actPerformer.modelVariant,
                        mcpServerNames: actPerformer.mcpServerNames,
                        planMode: actPerformer.planMode ?? false,
                    },
                    actId,
                    relatedPerformers,
                })
            } catch (err: any) {
                addActMsg({
                    id: `msg-${Date.now()}`,
                    role: 'system',
                    content: formatStudioApiErrorMessage(err),
                    timestamp: Date.now(),
                })
                set({ loadingPerformerId: null })
            }
        },
    }
}
