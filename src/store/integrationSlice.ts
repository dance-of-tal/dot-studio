import type { StateCreator } from 'zustand'
import type { StudioState, IntegrationSlice } from './types'
import type { AdapterViewEvent } from '../../shared/adapter-view'
import { api } from '../api'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../lib/performers'
import { formatStudioApiErrorComment } from '../lib/api-errors'
import { mapSessionMessagesToChatMessages } from '../lib/chat-messages'
import {
    adapterEventSourceInstance,
    adapterEventSourceWorkingDir,
    actEventSourceInstance,
    actEventSourceSessionId,
    actEventSourceWorkingDir,
    clearIntegrationStreamingState,
    clearStreamingSession,
    eventSourceInstance,
    eventSourceWorkingDir,
    resolveCurrentActSessionId,
    setAdapterEventSourceInstance,
    setAdapterEventSourceWorkingDir,
    setActEventSourceInstance,
    setActEventSourceSessionId,
    setActEventSourceWorkingDir,
    setEventSourceInstance,
    setEventSourceWorkingDir,
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
} from './integration-event-handlers'

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
                () => target.kind === 'act-performer'
                    ? mapped.filter((message) => message.role !== 'user')
                    : mapped,
            ))
        } catch {
            // Ignore background sync failures and keep the streamed content.
        } finally {
            clearStreamingSession(sessionId)
            syncingSessions.delete(sessionId)
        }
    }

    const reconnectEventSource = () => {
        const workingDir = get().workingDir || null
        if (eventSourceInstance && eventSourceWorkingDir === workingDir) {
            return
        }

        if (eventSourceInstance) {
            eventSourceInstance.close()
            setEventSourceInstance(null)
        }

        setEventSourceWorkingDir(workingDir)
        setEventSourceInstance(api.chat.events())
        const chatEventSource = eventSourceInstance
        if (!chatEventSource) {
            return
        }
        chatEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)

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
            } catch {
                // Ignore malformed events and keep the stream alive.
            }
        }

        chatEventSource.onerror = () => {
            if (eventSourceInstance) {
                eventSourceInstance.close()
                setEventSourceInstance(null)
            }
        }
    }

    const reconnectActEventSource = () => {
        const state = get()
        const workingDir = state.workingDir || null
        const actSessionId = resolveCurrentActSessionId(state)

        if (
            actEventSourceInstance
            && actEventSourceWorkingDir === workingDir
            && actEventSourceSessionId === actSessionId
        ) {
            return
        }

        if (actEventSourceInstance) {
            actEventSourceInstance.close()
            setActEventSourceInstance(null)
        }

        setActEventSourceWorkingDir(workingDir)
        setActEventSourceSessionId(actSessionId)

        if (!actSessionId) {
            return
        }

        setActEventSourceInstance(api.act.events(actSessionId))
        const currentActEventSource = actEventSourceInstance
        if (!currentActEventSource) {
            return
        }
        currentActEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                if (data.actSessionId !== actSessionId) {
                    return
                }

                if (data.type === 'act.performer.binding') {
                    set((state) => {
                        const currentBindings = state.actPerformerBindings[actSessionId] || []
                        const nextBinding = {
                            sessionId: data.sessionId,
                            nodeId: data.nodeId,
                            nodeLabel: data.nodeLabel,
                            performerId: data.performerId || null,
                            performerName: data.performerName || null,
                        }
                        const existingIndex = currentBindings.findIndex((binding) => binding.sessionId === data.sessionId)
                        const nextBindings = existingIndex === -1
                            ? [...currentBindings, nextBinding]
                            : currentBindings.map((binding, index) => index === existingIndex ? nextBinding : binding)

                        return {
                            actPerformerBindings: {
                                ...state.actPerformerBindings,
                                [actSessionId]: nextBindings,
                            },
                            actPerformerChats: {
                                ...state.actPerformerChats,
                                [actSessionId]: {
                                    ...(state.actPerformerChats[actSessionId] || {}),
                                    [data.sessionId]: state.actPerformerChats[actSessionId]?.[data.sessionId] || [],
                                },
                            },
                        }
                    })
                    void syncSessionMessages(
                        { kind: 'act-performer', actSessionId, performerSessionId: data.sessionId },
                        data.sessionId,
                    )
                    return
                }

                if (data.type !== 'act.runtime') {
                    return
                }

                set((state) => ({
                    actSessions: state.actSessions.map((session) => (
                        session.id === data.actSessionId
                            ? {
                                ...session,
                                status: data.status,
                                updatedAt: data.summary?.updatedAt || Date.now(),
                                lastRunId: data.runId || session.lastRunId,
                                resumeSummary: data.summary || session.resumeSummary,
                            }
                            : session
                    )),
                }))

                if (data.status === 'completed' || data.status === 'failed') {
                    set((state) => ({
                        loadingActId: state.selectedActId && state.actSessionMap[state.selectedActId] === data.actSessionId
                            ? null
                            : state.loadingActId,
                    }))
                }
            } catch {
                // Ignore malformed act runtime events.
            }
        }

        currentActEventSource.onerror = () => {
            if (actEventSourceInstance) {
                actEventSourceInstance.close()
                setActEventSourceInstance(null)
            }
        }
    }

    const reconnectAdapterEventSource = () => {
        const workingDir = get().workingDir || null
        if (adapterEventSourceInstance && adapterEventSourceWorkingDir === workingDir) {
            return
        }

        if (adapterEventSourceInstance) {
            adapterEventSourceInstance.close()
            setAdapterEventSourceInstance(null)
        }

        setAdapterEventSourceWorkingDir(workingDir)
        setAdapterEventSourceInstance(api.adapter.events())
        const currentAdapterEventSource = adapterEventSourceInstance
        if (!currentAdapterEventSource) {
            return
        }
        currentAdapterEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as AdapterViewEvent
                if (data.type === 'adapter.updated') {
                    get().upsertAdapterViewProjection(data.projection)
                    return
                }
                if (data.type === 'adapter.cleared') {
                    const current = get().adapterViewsByPerformer[data.performerId] || {}
                    const next = { ...current }
                    delete next[data.adapterId]
                    set((state) => ({
                        adapterViewsByPerformer: {
                            ...state.adapterViewsByPerformer,
                            [data.performerId]: next,
                        },
                    }))
                }
            } catch {
                // Ignore malformed adapter events.
            }
        }

        currentAdapterEventSource.onerror = () => {
            if (adapterEventSourceInstance) {
                adapterEventSourceInstance.close()
                setAdapterEventSourceInstance(null)
            }
        }
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

        cleanupRealtimeEvents: () => {
            if (eventSourceInstance) {
                eventSourceInstance.close()
                setEventSourceInstance(null)
            }
            if (actEventSourceInstance) {
                actEventSourceInstance.close()
                setActEventSourceInstance(null)
            }
            if (adapterEventSourceInstance) {
                adapterEventSourceInstance.close()
                setAdapterEventSourceInstance(null)
            }
            setEventSourceWorkingDir(null)
            setActEventSourceWorkingDir(null)
            setActEventSourceSessionId(null)
            setAdapterEventSourceWorkingDir(null)
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
                const res = await api.compile(
                    runtimeConfig.talRef,
                    runtimeConfig.danceRefs,
                    runtimeConfig.model,
                    runtimeConfig.modelVariant,
                    runtimeConfig.agentId,
                    runtimeConfig.mcpServerNames,
                    get().drafts,
                    runtimeConfig.planMode,
                    runtimeConfig.danceDeliveryMode,
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
