import type { StateCreator } from 'zustand'
import type { StudioState, IntegrationSlice } from './types'
import type { AdapterViewEvent } from '../../shared/adapter-view'
import { api } from '../api'
import { logChatDebug } from '../lib/chat-debug'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../lib/performers'
import { formatStudioApiErrorComment } from '../lib/api-errors'
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
import {
    clearChatSessionView,
    registerSessionBinding,
    syncSessionSnapshot,
} from './session'
import { hasRunningStudioSessions } from './runtime-reload-utils'
import {
    applyAuthoritativeActThreads,
    buildDeletedActThreadState,
    listActThreadChatKeys,
} from './act-slice-helpers'
import {
    createSessionSupervisor,
    shouldStartSessionSupervision,
    shouldStopSessionSupervision,
} from './chat/session-recovery'

type ChatEvent = {
    type?: string
    properties?: Record<string, unknown>
}

type ActThreadRuntimeSnapshot = {
    id: string
    actId: string
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    participantSessions: Record<string, string>
    participantStatuses: Record<string, { type: 'idle' | 'busy' | 'retry' | 'error'; updatedAt: number; message?: string }>
    createdAt: number
}

const CHAT_EVENT_TYPES = new Set([
    'message.updated', 'message.removed',
    'message.part.updated', 'message.part.delta', 'message.part.removed',
    'session.status', 'session.idle', 'session.compacted', 'session.error',
    'permission.asked', 'permission.replied',
    'question.asked', 'question.replied', 'question.rejected',
    'todo.updated',
])

const FAILED_RESOLVE_RETRY_MS = 2_000
const SESSION_SYNC_DEBOUNCE_MS = 1_000
const MAX_PENDING_EVENTS_PER_SESSION = 200

function readSessionIdFromEventProperties(properties: Record<string, unknown> | undefined): string | undefined {
    if (!properties) return undefined

    const directSessionId = properties.sessionID ?? properties.sessionId
    if (typeof directSessionId === 'string' && directSessionId) {
        return directSessionId
    }

    const info = properties.info
    if (info && typeof info === 'object') {
        const nestedSessionId = (info as { sessionID?: string; sessionId?: string }).sessionID
            ?? (info as { sessionID?: string; sessionId?: string }).sessionId
        if (typeof nestedSessionId === 'string' && nestedSessionId) {
            return nestedSessionId
        }
    }

    const part = properties.part
    if (part && typeof part === 'object') {
        const nestedSessionId = (part as { sessionID?: string; sessionId?: string }).sessionID
            ?? (part as { sessionID?: string; sessionId?: string }).sessionId
        if (typeof nestedSessionId === 'string' && nestedSessionId) {
            return nestedSessionId
        }
    }

    return undefined
}

function resolveSessionTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
    return selectStreamTarget(state, sessionId)
}

function streamTargetToChatKey(target: SessionStreamTarget): string {
    return target.kind === 'performer' ? target.performerId : target.chatKey
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
    const lastSyncedAt = new Map<string, number>()
    const pendingSessionEvents = new Map<string, ChatEvent[]>()

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

    function registerResolvedSessionBinding(sessionId: string, ownerId: string) {
        registerSessionBinding(set, get, ownerId, sessionId)
    }

    function bufferPendingSessionEvent(sessionId: string, event: ChatEvent) {
        const queue = pendingSessionEvents.get(sessionId) || []
        queue.push(event)
        if (queue.length > MAX_PENDING_EVENTS_PER_SESSION) {
            queue.splice(0, queue.length - MAX_PENDING_EVENTS_PER_SESSION)
        }
        pendingSessionEvents.set(sessionId, queue)
    }

    function takePendingSessionEvents(sessionId: string) {
        const queue = pendingSessionEvents.get(sessionId)
        if (!queue?.length) {
            return []
        }
        pendingSessionEvents.delete(sessionId)
        logChatDebug('integration', 'flush buffered session events', {
            sessionId,
            count: queue.length,
        })
        return queue
    }

    function repairKnownSessionBinding(sessionId: string): SessionStreamTarget | null {
        const directTarget = resolveSessionTarget(get(), sessionId)
        if (directTarget) {
            return directTarget
        }

        const repairedEntry = Object.entries(get().chatKeyToSession)
            .find(([, boundSessionId]) => boundSessionId === sessionId)
        if (!repairedEntry) {
            return null
        }

        registerSessionBinding(set, get, repairedEntry[0], sessionId)
        return resolveSessionTarget(get(), sessionId)
    }

    async function ensureSessionTarget(sessionId: string): Promise<SessionStreamTarget | null> {
        const repaired = repairKnownSessionBinding(sessionId)
        if (repaired) {
            return repaired
        }

        try {
            const result = await api.chat.resolveSession(sessionId)
            if (!result.found || !result.ownerId) {
                failedResolves.set(sessionId, Date.now())
                return null
            }

            failedResolves.delete(sessionId)
            registerResolvedSessionBinding(sessionId, result.ownerId)
            return resolveSessionTarget(get(), sessionId)
        } catch {
            failedResolves.set(sessionId, Date.now())
            return null
        }
    }

    async function syncSessionMessages(
        target: SessionStreamTarget,
        sessionId: string,
        options?: { force?: boolean; reason?: string },
    ) {
        const chatKey = streamTargetToChatKey(target)
        if (syncingSessions.has(sessionId)) {
            logChatDebug('integration', 'skip sync: already syncing', {
                sessionId,
                chatKey,
                reason: options?.reason || 'background',
            })
            return
        }

        const lastSynced = lastSyncedAt.get(sessionId) || 0
        if (!options?.force && (Date.now() - lastSynced) < SESSION_SYNC_DEBOUNCE_MS) {
            logChatDebug('integration', 'skip sync: recently synced', {
                sessionId,
                chatKey,
                reason: options?.reason || 'background',
            })
            return
        }

        syncingSessions.add(sessionId)
        try {
            logChatDebug('integration', 'sync session messages', {
                sessionId,
                chatKey,
                reason: options?.reason || 'background',
                target: target.kind,
            })
            await syncSessionSnapshot(set, get, chatKey, sessionId)
            lastSyncedAt.set(sessionId, Date.now())
        } catch {
            // Ignore background sync failures and keep streamed content.
        } finally {
            syncingSessions.delete(sessionId)
        }
    }

    const sessionSupervisor = createSessionSupervisor({
        get,
        set,
        syncSessionMessages: (chatKey, sessionId) => syncSessionSnapshot(set, get, chatKey, sessionId),
        setSessionStatus: (sessionId, status) => get().setSessionStatus(sessionId, status),
        setSessionLoading: (sessionId, loading) => get().setSessionLoading(sessionId, loading),
    })

    function reconcileSessionSupervision(
        target: SessionStreamTarget | null,
        sessionId: string,
        events: ChatEvent[],
    ) {
        if (!target) {
            return
        }

        let nextAction: 'start' | 'stop' | null = null
        for (const event of events) {
            if (shouldStopSessionSupervision(event)) {
                nextAction = 'stop'
                continue
            }
            if (shouldStartSessionSupervision(event)) {
                nextAction = 'start'
            }
        }

        if (nextAction === 'stop') {
            sessionSupervisor.stop(sessionId)
            return
        }

        if (nextAction === 'start') {
            sessionSupervisor.schedule(streamTargetToChatKey(target), sessionId)
        }
    }

    function processResolvedSessionEvents(
        target: SessionStreamTarget | null,
        sessionId: string,
        events: ChatEvent[],
    ) {
        if (!target) {
            return
        }

        reconcileSessionSupervision(target, sessionId, events)
        for (const event of events) {
            if (!event.type || !CHAT_EVENT_TYPES.has(event.type)) {
                continue
            }
            eventIngest.enqueue(event)
        }
    }

    async function handleActThreadUpdated(thread: ActThreadRuntimeSnapshot) {
        const existingThreads = get().actThreads[thread.actId] || []
        const nextThreads = existingThreads.some((entry) => entry.id === thread.id)
            ? existingThreads.map((entry) => (entry.id === thread.id ? thread : entry))
            : [...existingThreads, thread]

        await applyAuthoritativeActThreads(get, set, thread.actId, nextThreads)
    }

    function handleActThreadDeleted(actId: string, threadId: string) {
        const state = get()
        const removedChatKeys = listActThreadChatKeys(state, actId, threadId)
        set((current) => buildDeletedActThreadState(current, actId, threadId))
        for (const chatKey of removedChatKeys) {
            clearChatSessionView(get, chatKey)
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
        logChatDebug('integration', 'lazy resolve session start', { sessionId })

        api.chat.resolveSession(sessionId)
            .then((result) => {
                pendingResolves.delete(sessionId)
                if (!result.found || !result.ownerId) {
                    logChatDebug('integration', 'lazy resolve session miss', { sessionId })
                    failedResolves.set(sessionId, Date.now())
                    return
                }

                failedResolves.delete(sessionId)
                logChatDebug('integration', 'lazy resolve session hit', {
                    sessionId,
                    ownerId: result.ownerId,
                    ownerKind: result.ownerKind,
                })
                registerResolvedSessionBinding(sessionId, result.ownerId)
                const queuedEvents = takePendingSessionEvents(sessionId)
                const target = repairKnownSessionBinding(sessionId) || resolveSessionTarget(get(), sessionId)
                if (target) {
                    processResolvedSessionEvents(target, sessionId, queuedEvents)
                    void syncSessionMessages(target, sessionId, { reason: 'lazy-resolve' })
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
                    for (const sessionId of Object.keys(get().sessionToChatKey)) {
                        knownSessionIds.add(sessionId)
                    }
                    for (const sessionId of knownSessionIds) {
                        const target = repairKnownSessionBinding(sessionId) || resolveSessionTarget(get(), sessionId)
                        if (target) {
                            void syncSessionMessages(target, sessionId, { reason: 'server.connected' })
                        }
                    }
                    return
                }

                if (event.type === 'server.heartbeat') {
                    return
                }

                 if (event.type === 'act.thread.updated') {
                    const thread = (event.properties as { thread?: ActThreadRuntimeSnapshot } | undefined)?.thread
                    if (thread) {
                        void handleActThreadUpdated(thread)
                    }
                    return
                }

                if (event.type === 'act.thread.deleted') {
                    const properties = event.properties as { actId?: string; threadId?: string } | undefined
                    if (properties?.actId && properties.threadId) {
                        handleActThreadDeleted(properties.actId, properties.threadId)
                    }
                    return
                }

                const rawProps = event.properties as {
                    sessionID?: string
                    sessionId?: string
                    ownerId?: string
                    info?: { sessionID?: string; sessionId?: string }
                    part?: { sessionID?: string; sessionId?: string }
                } | undefined
                const sessionID = readSessionIdFromEventProperties(rawProps)
                if (event.type && CHAT_EVENT_TYPES.has(event.type) && event.type !== 'message.part.delta') {
                    logChatDebug('integration', 'received chat event', {
                        type: event.type,
                        sessionId: sessionID || null,
                        ownerId: rawProps?.ownerId || null,
                    })
                }
                if (sessionID) {
                    if (rawProps?.ownerId && !get().sessionToChatKey[sessionID]) {
                        logChatDebug('integration', 'bind session from event owner', {
                            sessionId: sessionID,
                            ownerId: rawProps.ownerId,
                        })
                        registerResolvedSessionBinding(sessionID, rawProps.ownerId)
                    }
                    const knownTarget = repairKnownSessionBinding(sessionID) || resolveSessionTarget(get(), sessionID)
                    if (!knownTarget) {
                        logChatDebug('integration', 'event session target unknown', {
                            type: event.type,
                            sessionId: sessionID,
                        })
                        if (event.type && CHAT_EVENT_TYPES.has(event.type)) {
                            bufferPendingSessionEvent(sessionID, event)
                        }
                        tryLazyResolveSession(sessionID)
                        return
                    }
                    processResolvedSessionEvents(knownTarget, sessionID, [
                        ...takePendingSessionEvents(sessionID),
                        event,
                    ])
                    return
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
            sessionSupervisor.stop(sessionId)
            logChatDebug('integration', 'session idle callback', { sessionId })
            void ensureSessionTarget(sessionId).then((target) => {
                if (target) {
                    return syncSessionMessages(target, sessionId, {
                        force: true,
                        reason: 'session.idle',
                    })
                }
                logChatDebug('integration', 'session idle callback target missing', { sessionId })
                return undefined
            })
            const state = get()
            if (state.runtimeReloadPending && !hasRunningStudioSessions(state)) {
                void state.applyPendingRuntimeReload()
            }
        },
        onSessionCompacted: (sessionId: string) => {
            logChatDebug('integration', 'session compacted callback', { sessionId })
            void ensureSessionTarget(sessionId).then((target) => {
                if (target) {
                    return syncSessionMessages(target, sessionId, {
                        force: true,
                        reason: 'session.compacted',
                    })
                }
                logChatDebug('integration', 'session compacted callback target missing', { sessionId })
                return undefined
            })
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
                    const entity = { ...state.sePermissions }
                    for (const permission of permissions) {
                        entity[permission.sessionID] = permission
                    }
                    return {
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
            sessionSupervisor.dispose()
            syncingSessions.clear()
            pendingResolves.clear()
            failedResolves.clear()
            lastSyncedAt.clear()
            pendingSessionEvents.clear()
        },

        watchSessionLifecycle: (chatKey, sessionId) => {
            sessionSupervisor.schedule(chatKey, sessionId)
        },

        stopWatchingSessionLifecycle: (sessionId) => {
            sessionSupervisor.stop(sessionId)
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
                    requestTargets,
                )
                const lines = [
                    `// OpenCode Agent: ${res.agent}`,
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
                    lines.push('', '// Enabled MCP Tool Globs')
                    for (const toolPattern of res.toolResolution.resolvedTools) {
                        lines.push(`- ${toolPattern}`)
                    }
                }

                if (res.toolResolution && res.toolResolution.unavailableTools.length > 0) {
                    lines.push('', '// Unavailable MCP Tool Globs')
                    for (const toolPattern of res.toolResolution.unavailableTools) {
                        lines.push(`- ${toolPattern}`)
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
