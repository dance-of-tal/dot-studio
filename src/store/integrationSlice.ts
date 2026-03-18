import type { StateCreator } from 'zustand'
import type { StudioState, IntegrationSlice } from './types'
import type { AdapterViewEvent } from '../../shared/adapter-view'
import { api } from '../api'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../lib/performers'
import { formatStudioApiErrorComment } from '../lib/api-errors'
import { mapSessionMessagesToChatMessages } from '../lib/chat-messages'
import {
    clearIntegrationStreamingState,
    clearStreamingSession,
    streamingMessageKey,
    streamingMessageRoles,
    syncingSessions,
    updateTargetMessages,
} from './integration-streaming'
import type { SessionStreamTarget } from './integration-streaming'
import {
    handleLspDiagnostics,
    handleLspUpdated,
    handleMcpToolsChanged,
    handleMcpBrowserOpenFailed,
    handleMessageUpdated,
    handleMessagePartUpdated,
    handleMessagePartDelta,
    handleMessagePartRemoved,
    handleSessionStatus,
    handleSessionIdle,
    handleSessionCompacted,
    handleSessionError,
    handlePermissionAsked,
    handlePermissionReplied,
    handleQuestionAsked,
    handleQuestionReplied,
    handleTodoUpdated,
} from './integration-event-handlers'
import {
    reconnectManagedEventSource,
    closeManagedEventSource,
    resetManagedEventSource,
} from './integration-eventsource'
import type { EventSourceSlot } from './integration-eventsource'
import {
    eventSourceInstance, setEventSourceInstance,
    eventSourceWorkingDir, setEventSourceWorkingDir,
    adapterEventSourceInstance, setAdapterEventSourceInstance,
    adapterEventSourceWorkingDir, setAdapterEventSourceWorkingDir,
} from './integration-streaming'

export const createIntegrationSlice: StateCreator<
    StudioState,
    [],
    [],
    IntegrationSlice
> = (set, get) => {
    const syncSessionMessages = async (target: SessionStreamTarget, sessionId: string) => {
        if (syncingSessions.has(sessionId)) {
            return
        }

        syncingSessions.add(sessionId)
        try {
            const messages = await api.chat.messages(sessionId)
            for (const message of messages) {
                const messageId = message?.info?.id || message?.id
                const role = message?.info?.role || message?.role
                if (!messageId || typeof role !== 'string') {
                    continue
                }
                if (role === 'user' || role === 'assistant' || role === 'system') {
                    streamingMessageRoles.set(streamingMessageKey(sessionId, messageId), role)
                }
            }
            const mapped = mapSessionMessagesToChatMessages(messages)
            set((state) => updateTargetMessages(
                state,
                target,
                () => mapped,
            ))
        } catch {
            // Ignore background sync failures and keep the streamed content.
        } finally {
            clearStreamingSession(sessionId)
            syncingSessions.delete(sessionId)
        }
    }

    // ── EventSource Slots ────────────────────────────────

    const chatSlot: EventSourceSlot = {
        getInstance: () => eventSourceInstance,
        setInstance: setEventSourceInstance,
        getWorkingDir: () => eventSourceWorkingDir,
        setWorkingDir: setEventSourceWorkingDir,
    }


    const adapterSlot: EventSourceSlot = {
        getInstance: () => adapterEventSourceInstance,
        setInstance: setAdapterEventSourceInstance,
        getWorkingDir: () => adapterEventSourceWorkingDir,
        setWorkingDir: setAdapterEventSourceWorkingDir,
    }

    // ── Reconnect wrappers ───────────────────────────────

    const reconnectEventSource = () => {
        reconnectManagedEventSource({
            slot: chatSlot,
            resolveWorkingDir: () => get().workingDir || null,
            createEventSource: () => api.chat.events(),
            onMessage: (data: any) => {
                if (data.type === 'lsp.client.diagnostics') return handleLspDiagnostics(data, get, set)
                if (data.type === 'lsp.updated') return handleLspUpdated(get)
                if (data.type === 'mcp.tools.changed') return handleMcpToolsChanged(get)
                if (data.type === 'mcp.browser.open.failed') return handleMcpBrowserOpenFailed(data)
                if (data.type === 'message.updated') return handleMessageUpdated(data, get, set)
                if (data.type === 'message.part.updated') return handleMessagePartUpdated(data, get, set)
                if (data.type === 'message.part.delta') return handleMessagePartDelta(data, get, set)
                if (data.type === 'message.part.removed') return handleMessagePartRemoved(data, get, set)
                if (data.type === 'session.status') return handleSessionStatus(data, get, set)
                if (data.type === 'session.idle') return handleSessionIdle(data, get, set, syncSessionMessages)
                if (data.type === 'session.compacted') return handleSessionCompacted(data, get, set, syncSessionMessages)
                if (data.type === 'session.error') return handleSessionError(data, get, set)
                if (data.type === 'permission.asked') return handlePermissionAsked(data, get, set)
                if (data.type === 'permission.replied') return handlePermissionReplied(data, get, set)
                if (data.type === 'question.asked') return handleQuestionAsked(data, get, set)
                if (data.type === 'question.replied') return handleQuestionReplied(data, get, set)
                if (data.type === 'todo.updated') return handleTodoUpdated(data, get, set)
            },
        })
    }

    // Act event source removed (Phase 2 pending)
    const reconnectActEventSource = () => {
        // no-op — Act runtime events were removed
    }

    const reconnectAdapterEventSource = () => {
        reconnectManagedEventSource({
            slot: adapterSlot,
            resolveWorkingDir: () => get().workingDir || null,
            createEventSource: () => api.adapter.events(),
            onMessage: (data: unknown) => {
                const event = data as AdapterViewEvent
                if (event.type === 'adapter.updated') {
                    get().upsertAdapterViewProjection(event.projection)
                    return
                }
                if (event.type === 'adapter.cleared') {
                    const current = get().adapterViewsByPerformer[event.performerId] || {}
                    const next = { ...current }
                    delete next[event.adapterId]
                    set((state) => ({
                        adapterViewsByPerformer: {
                            ...state.adapterViewsByPerformer,
                            [event.performerId]: next,
                        },
                    }))
                }
            },
        })
    }

    return ({
        lspServers: [],
        lspDiagnostics: {},

        fetchLspStatus: async () => {
            try {
                const servers = await api.lsp.status()
                set({ lspServers: servers })
            } catch {
                set({ lspServers: [] })
            }
        },

        initRealtimeEvents: () => {
            reconnectEventSource()
            reconnectActEventSource()
            reconnectAdapterEventSource()
        },

        forceReconnectRealtimeEvents: () => {
            // Reset the chat SSE slot so that the next reconnect picks up
            // any new execution directories (e.g. newly created safe-mode
            // performer sessions) that weren't subscribed to before.
            resetManagedEventSource(chatSlot)
            reconnectEventSource()
            // Adapter stream also depends on directory scope.
            resetManagedEventSource(adapterSlot)
            reconnectAdapterEventSource()
        },

        cleanupRealtimeEvents: () => {
            closeManagedEventSource(chatSlot)
            closeManagedEventSource(adapterSlot)
            chatSlot.setWorkingDir(null)
            adapterSlot.setWorkingDir(null)
            clearIntegrationStreamingState()
        },

        compilePrompt: async (performerId) => {
            const performer = get().performers.find((a: any) => a.id === performerId)
            if (!performer) return '// No performer selected'
            const runtimeConfig = resolvePerformerRuntimeConfig(performer)
            if (!hasModelConfig(runtimeConfig.model)) {
                return '// Prompt preview unavailable.'
            }
            try {
                // Standalone performers no longer have edges — delegation only inside Act
                const relatedPerformers: Array<{ performerId: string; performerName: string; description: string }> = []
                const res = await api.compile(
                    performer.id,
                    performer.name,
                    runtimeConfig.talRef,
                    runtimeConfig.danceRefs,
                    runtimeConfig.model,
                    runtimeConfig.modelVariant,
                    runtimeConfig.agentId,
                    runtimeConfig.mcpServerNames,
                    runtimeConfig.planMode,
                    runtimeConfig.danceDeliveryMode,
                    relatedPerformers,
                )
                const lines = [
                    `// OpenCode Agent: ${res.agent}`,
                    `// Delivery Mode: ${res.deliveryMode}`,
                ]

                if (runtimeConfig.modelVariant) {
                    lines.push(`// Model Variant: ${runtimeConfig.modelVariant}`)
                }

                if (res.capabilitySnapshot) {
                    lines.push(
                        `// Model Capabilities: tools=${res.capabilitySnapshot.toolCall ? 'yes' : 'no'}, attachments=${res.capabilitySnapshot.attachment ? 'yes' : 'no'}, reasoning=${res.capabilitySnapshot.reasoning ? 'yes' : 'no'}`,
                    )
                }

                if (res.toolName) {
                    lines.push(`// Capability Loader Tool: ${res.toolName}`)
                }

                if (res.danceCatalog.length > 0) {
                    lines.push('', '// Dance Catalog')
                    for (const dance of res.danceCatalog) {
                        lines.push(`- ${dance.urn} (${dance.loadMode})${dance.description ? `: ${dance.description}` : ''}`)
                    }
                }

                if (res.toolResolution && res.toolResolution.selectedMcpServers.length > 0) {
                    lines.push('', `// Selected MCP Servers: ${res.toolResolution.selectedMcpServers.join(', ')}`)
                }

                if (res.toolResolution && res.toolResolution.resolvedTools.length > 0) {
                    lines.push('', '// Resolved Tools')
                    for (const toolId of res.toolResolution.resolvedTools) {
                        lines.push(`- ${toolId}`)
                    }
                }

                if (res.toolResolution && res.toolResolution.unavailableTools.length > 0) {
                    lines.push('', '// Tools Not Available For Current Model')
                    for (const toolId of res.toolResolution.unavailableTools) {
                        lines.push(`- ${toolId}`)
                    }
                }

                if (res.toolResolution && res.toolResolution.unavailableDetails.length > 0) {
                    lines.push('', '// MCP Availability')
                    for (const detail of res.toolResolution.unavailableDetails) {
                        lines.push(`- ${detail.serverName}: ${detail.reason}${detail.toolId ? ` (${detail.toolId})` : ''}${detail.detail ? ` — ${detail.detail}` : ''}`)
                    }
                }

                lines.push('', res.system)
                return lines.join('\n')
            } catch (err) {
                return formatStudioApiErrorComment(err)
            }
        },
    })
}
