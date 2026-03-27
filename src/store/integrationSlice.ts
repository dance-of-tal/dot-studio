import type { StateCreator } from 'zustand'
import type { StudioState, IntegrationSlice } from './types'
import type { AdapterViewEvent } from '../../shared/adapter-view'
import type { ChatMessage } from '../types'
import { api } from '../api'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../lib/performers'
import { formatStudioApiErrorComment } from '../lib/api-errors'
import { mapSessionMessagesToChatMessages, mergeSystemPrefixMessages } from '../lib/chat-messages'
import type { SessionMessageLike } from '../lib/chat-messages'
import {
    handleLspDiagnostics,
    handleLspUpdated,
    handleMcpToolsChanged,
    handleMcpBrowserOpenFailed,
} from './integration-event-handlers'
import {
    reconnectManagedEventSource,
    closeManagedEventSource,
    resetManagedEventSource,
} from './integration-eventsource'
import type { EventSourceSlot } from './integration-eventsource'
import { createEventIngest } from './session/event-ingest'
import { selectStreamTarget } from './session/session-selectors'
import type { SessionStreamTarget } from './session/session-selectors'

type ChatEvent = {
    type?: string
    properties?: Record<string, unknown>
}

type SliceSet = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type SliceGet = () => StudioState

const CHAT_EVENT_TYPES = new Set([
    'message.updated', 'message.removed',
    'message.part.updated', 'message.part.delta', 'message.part.removed',
    'session.status', 'session.idle', 'session.compacted', 'session.error',
    'permission.asked', 'permission.replied',
    'question.asked', 'question.replied', 'question.rejected',
    'todo.updated',
])

const FAILED_RESOLVE_RETRY_MS = 2_000

function resolveSessionTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
    const entityTarget = selectStreamTarget(state, sessionId)
    if (entityTarget) {
        return entityTarget
    }

    for (const [chatKey, mappedSessionId] of Object.entries(state.sessionMap)) {
        if (mappedSessionId !== sessionId) {
            continue
        }
        if (chatKey.startsWith('act:')) {
            return { kind: 'act-participant', chatKey }
        }
        return { kind: 'performer', performerId: chatKey }
    }

    return null
}

function updateTargetMessages(
    state: StudioState,
    target: SessionStreamTarget,
    updater: (messages: ChatMessage[]) => ChatMessage[],
) {
    if (target.kind === 'performer') {
        return {
            chats: {
                ...state.chats,
                [target.performerId]: updater(state.chats[target.performerId] || []),
            },
        }
    }

    return {
        chats: {
            ...state.chats,
            [target.chatKey]: updater(state.chats[target.chatKey] || []),
        },
    }
}

function parseActParticipantOwnerId(ownerId: string) {
    const match = ownerId.match(/^act:([^:]+):thread:([^:]+):participant:(.+)$/)
    if (!match) {
        return null
    }

    const [, actId, threadId, participantKey] = match
    return {
        actId,
        threadId,
        participantKey,
    }
}

function streamTargetToChatKey(target: SessionStreamTarget): string {
    return target.kind === 'performer' ? target.performerId : target.chatKey
}

function registerResolvedSessionBinding(
    set: SliceSet,
    get: SliceGet,
    sessionId: string,
    ownerId: string,
) {
    const actOwner = parseActParticipantOwnerId(ownerId)

    set((state) => ({
        sessionMap: { ...state.sessionMap, [ownerId]: sessionId },
        chatKeyToSession: { ...state.chatKeyToSession, [ownerId]: sessionId },
        sessionToChatKey: { ...state.sessionToChatKey, [sessionId]: ownerId },
        ...(actOwner
            ? {
                actThreads: {
                    ...state.actThreads,
                    [actOwner.actId]: (state.actThreads[actOwner.actId] || []).map((thread) =>
                        thread.id !== actOwner.threadId
                            ? thread
                            : {
                                ...thread,
                                participantSessions: {
                                    ...thread.participantSessions,
                                    [actOwner.participantKey]: sessionId,
                                },
                            },
                    ),
                },
            }
            : {}),
    }))

    if (!get().seEntities[sessionId]) {
        get().upsertSession({ id: sessionId, status: { type: 'idle' } })
    }
}

export const createIntegrationSlice: StateCreator<
    StudioState,
    [],
    [],
    IntegrationSlice
> = (set, get) => {
    const syncingSessions = new Set<string>()
    const pendingResolves = new Set<string>()
    const failedResolves = new Map<string, number>()

    let eventSourceInstance: EventSource | null = null
    let eventSourceWorkingDir: string | null = null
    let adapterEventSourceInstance: EventSource | null = null
    let adapterEventSourceWorkingDir: string | null = null

    const chatSlot: EventSourceSlot = {
        getInstance: () => eventSourceInstance,
        setInstance: (next) => {
            eventSourceInstance = next
        },
        getWorkingDir: () => eventSourceWorkingDir,
        setWorkingDir: (next) => {
            eventSourceWorkingDir = next
        },
    }

    const adapterSlot: EventSourceSlot = {
        getInstance: () => adapterEventSourceInstance,
        setInstance: (next) => {
            adapterEventSourceInstance = next
        },
        getWorkingDir: () => adapterEventSourceWorkingDir,
        setWorkingDir: (next) => {
            adapterEventSourceWorkingDir = next
        },
    }

    async function syncSessionMessages(target: SessionStreamTarget, sessionId: string) {
        if (syncingSessions.has(sessionId)) {
            return
        }

        syncingSessions.add(sessionId)
        try {
            const response = await api.chat.messages(sessionId)
            const messages: SessionMessageLike[] = Array.isArray(response) ? response : (response.messages || [])
            const mapped = mapSessionMessagesToChatMessages(messages)
            const chatKey = streamTargetToChatKey(target)
            set((state) => updateTargetMessages(
                state,
                target,
                () => mergeSystemPrefixMessages(state.chatPrefixes[chatKey], mapped),
            ))
            get().setSessionMessages(sessionId, mapped)
        } catch {
            // Ignore background sync failures and keep streamed content.
        } finally {
            syncingSessions.delete(sessionId)
        }
    }

    function tryLazyResolveSession(sessionId: string) {
        const failedAt = failedResolves.get(sessionId)
        if (failedAt && (Date.now() - failedAt) < FAILED_RESOLVE_RETRY_MS) {
            return
        }
        if (pendingResolves.has(sessionId)) {
            return
        }
        if (resolveSessionTarget(get(), sessionId)) {
            return
        }

        pendingResolves.add(sessionId)

        api.chat.resolveSession(sessionId)
            .then((result) => {
                pendingResolves.delete(sessionId)
                if (!result.found || !result.ownerId) {
                    failedResolves.set(sessionId, Date.now())
                    return
                }

                failedResolves.delete(sessionId)
                registerResolvedSessionBinding(set, get, sessionId, result.ownerId)

                const target = resolveSessionTarget(get(), sessionId)
                if (target) {
                    void syncSessionMessages(target, sessionId)
                }
            })
            .catch(() => {
                pendingResolves.delete(sessionId)
                failedResolves.set(sessionId, Date.now())
            })
    }

    function reconnectEventSource() {
        reconnectManagedEventSource({
            slot: chatSlot,
            resolveWorkingDir: () => get().workingDir || null,
            createEventSource: () => api.chat.events(),
            onDisconnect: () => {
                if (get().loadingPerformerId) {
                    set({ loadingPerformerId: null })
                }
                eventIngest.flushSync()
            },
            onMessage: (data: unknown) => {
                const event = data as ChatEvent

                if (event.type === 'server.instance.disposed') {
                    resetManagedEventSource(chatSlot)
                    reconnectEventSource()
                    return
                }

                if (event.type === 'server.connected') {
                    get().fetchLspStatus()
                    const knownSessionIds = new Set<string>()
                    for (const sessionId of Object.values(get().sessionMap)) {
                        if (sessionId) {
                            knownSessionIds.add(sessionId)
                        }
                    }
                    for (const sessionId of Object.keys(get().sessionToChatKey)) {
                        knownSessionIds.add(sessionId)
                    }
                    for (const sessionId of knownSessionIds) {
                        const target = resolveSessionTarget(get(), sessionId)
                        if (target) {
                            void syncSessionMessages(target, sessionId)
                        }
                    }
                    return
                }

                if (event.type === 'server.heartbeat') {
                    return
                }

                const rawProps = event.properties as {
                    sessionID?: string
                    ownerId?: string
                    info?: { sessionID?: string }
                    part?: { sessionID?: string }
                } | undefined
                const sessionID = rawProps?.sessionID || rawProps?.info?.sessionID || rawProps?.part?.sessionID
                if (sessionID) {
                    if (rawProps?.ownerId && !get().sessionToChatKey[sessionID]) {
                        registerResolvedSessionBinding(set, get, sessionID, rawProps.ownerId)
                    }
                    const knownTarget = resolveSessionTarget(get(), sessionID)
                    if (!knownTarget) {
                        tryLazyResolveSession(sessionID)
                    } else if (!get().sessionToChatKey[sessionID]) {
                        const chatKey = streamTargetToChatKey(knownTarget)
                        get().registerBinding(chatKey, sessionID)
                        if (!get().seEntities[sessionID]) {
                            get().upsertSession({ id: sessionID, status: { type: 'idle' } })
                        }
                    }
                }

                if (event.type && CHAT_EVENT_TYPES.has(event.type)) {
                    eventIngest.enqueue(event)
                    return
                }

                if (event.type === 'lsp.client.diagnostics') return handleLspDiagnostics(event, get, set)
                if (event.type === 'lsp.updated') return handleLspUpdated(get)
                if (event.type === 'mcp.tools.changed') return handleMcpToolsChanged(get)
                if (event.type === 'mcp.browser.open.failed') return handleMcpBrowserOpenFailed(event)
            },
        })
    }

    const eventIngest = createEventIngest({
        get,
        set,
        onHeartbeatTimeout: () => {
            resetManagedEventSource(chatSlot)
            reconnectEventSource()
        },
        onSessionIdle: (sessionId: string) => {
            const target = resolveSessionTarget(get(), sessionId)
            if (target) {
                void syncSessionMessages(target, sessionId)
            }
        },
        onSessionCompacted: (sessionId: string) => {
            const target = resolveSessionTarget(get(), sessionId)
            if (target) {
                void syncSessionMessages(target, sessionId)
            }
        },
    })

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
            reconnectAdapterEventSource()
            api.chat.listPendingPermissions().then((permissions) => {
                if (permissions.length === 0) {
                    return
                }

                set((state) => {
                    const legacy = { ...state.pendingPermissions }
                    const entity = { ...state.sePermissions }
                    for (const permission of permissions) {
                        legacy[permission.sessionID] = permission
                        entity[permission.sessionID] = permission
                    }
                    return {
                        pendingPermissions: legacy,
                        sePermissions: entity,
                    }
                })
            }).catch(() => { /* ignore rehydration failures */ })
        },

        forceReconnectRealtimeEvents: () => {
            resetManagedEventSource(chatSlot)
            reconnectEventSource()
            resetManagedEventSource(adapterSlot)
            reconnectAdapterEventSource()
        },

        cleanupRealtimeEvents: () => {
            closeManagedEventSource(chatSlot)
            closeManagedEventSource(adapterSlot)
            chatSlot.setWorkingDir(null)
            adapterSlot.setWorkingDir(null)
            eventIngest.dispose()
            syncingSessions.clear()
            pendingResolves.clear()
            failedResolves.clear()
        },

        compilePrompt: async (performerId) => {
            const performer = get().performers.find((entry) => entry.id === performerId)
            if (!performer) return '// No performer selected'
            const runtimeConfig = resolvePerformerRuntimeConfig(performer)
            if (!hasModelConfig(runtimeConfig.model)) {
                return '// Prompt preview unavailable.'
            }
            try {
                // Standalone performers pass no extra request targets by default.
                const requestTargets: Array<{ performerId: string; performerName: string; description: string }> = []
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
                    requestTargets,
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
