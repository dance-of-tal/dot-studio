import type { StateCreator } from 'zustand'
import type { ActPerformerSessionBinding, ChatMessage, ChatMessagePart } from '../types'
import type { StudioState, IntegrationSlice } from './types'
import type { AdapterViewEvent } from '../../shared/adapter-view'
import { api } from '../api'
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../lib/performers'
import { formatStudioApiErrorComment } from '../lib/api-errors'
import { mapSessionMessagesToChatMessages, upsertAssistantStreamingMessage } from '../lib/chat-messages'
import { showToast } from '../lib/toast'
import { queryClient } from '../lib/query-client'

let eventSourceInstance: EventSource | null = null
let eventSourceWorkingDir: string | null = null
let actEventSourceInstance: EventSource | null = null
let actEventSourceWorkingDir: string | null = null
let actEventSourceSessionId: string | null = null
let adapterEventSourceInstance: EventSource | null = null
let adapterEventSourceWorkingDir: string | null = null
const streamingTextParts = new Map<string, Map<string, string>>()
const streamingReasoningParts = new Map<string, Map<string, string>>()
const streamingMessageRoles = new Map<string, 'user' | 'assistant' | 'system'>()
const streamingPartKinds = new Map<string, 'text' | 'reasoning'>()
const syncingSessions = new Set<string>()
const pendingActPerformerUpdates = new Map<string, Array<(messages: ChatMessage[]) => ChatMessage[]>>()
let pendingActPerformerFlushTimer: number | null = null

function diagnosticMatchesWorkingDir(uri: string, workingDir: string) {
    if (!workingDir) {
        return true
    }

    try {
        if (uri.startsWith('file://')) {
            const filePath = decodeURIComponent(new URL(uri).pathname)
            return filePath.startsWith(workingDir)
        }
    } catch {
        return false
    }

    return uri.includes(workingDir)
}

function streamingKey(sessionId: string, messageId: string) {
    return `${sessionId}:${messageId}`
}

function streamingPartKey(sessionId: string, messageId: string, partId: string) {
    return `${sessionId}:${messageId}:${partId}`
}

function streamingMessageKey(sessionId: string, messageId: string) {
    return `${sessionId}:${messageId}`
}

function clearStreamingSession(sessionId: string) {
    for (const key of streamingTextParts.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingTextParts.delete(key)
        }
    }

    for (const key of streamingReasoningParts.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingReasoningParts.delete(key)
        }
    }

    for (const key of streamingMessageRoles.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingMessageRoles.delete(key)
        }
    }

    for (const key of streamingPartKinds.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            streamingPartKinds.delete(key)
        }
    }
}

function performerIdForSession(sessionMap: Record<string, string>, sessionId: string): string | null {
    for (const [performerId, mappedSessionId] of Object.entries(sessionMap)) {
        if (mappedSessionId === sessionId) {
            return performerId
        }
    }
    return null
}

function actBindingForSession(
    actPerformerBindings: Record<string, ActPerformerSessionBinding[]>,
    sessionId: string,
): { actSessionId: string; binding: ActPerformerSessionBinding } | null {
    for (const [actSessionId, bindings] of Object.entries(actPerformerBindings)) {
        const binding = bindings.find((entry) => entry.sessionId === sessionId)
        if (binding) {
            return { actSessionId, binding }
        }
    }
    return null
}

type SessionStreamTarget =
    | { kind: 'performer'; performerId: string }
    | { kind: 'act-performer'; actSessionId: string; performerSessionId: string }

function resolveSessionTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
    const performerId = performerIdForSession(state.sessionMap, sessionId)
    if (performerId) {
        return { kind: 'performer', performerId }
    }
    const actBinding = actBindingForSession(state.actPerformerBindings, sessionId)
    if (actBinding) {
        return {
            kind: 'act-performer',
            actSessionId: actBinding.actSessionId,
            performerSessionId: sessionId,
        }
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

    const currentSessionChats = state.actPerformerChats[target.actSessionId] || {}
    return {
        actPerformerChats: {
            ...state.actPerformerChats,
            [target.actSessionId]: {
                ...currentSessionChats,
                [target.performerSessionId]: updater(currentSessionChats[target.performerSessionId] || []),
            },
        },
    }
}

function invalidateRuntimeQueries(workingDir: string) {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers', workingDir] })
    queryClient.invalidateQueries({ queryKey: ['runtime-tools', workingDir] })
}

function resolveEventSessionContext(
    state: StudioState,
    sessionId: string | null | undefined,
): { sessionId: string; target: SessionStreamTarget } | null {
    if (!sessionId) {
        return null
    }
    const target = resolveSessionTarget(state, sessionId)
    if (!target) {
        return null
    }
    return { sessionId, target }
}

function streamingPartContent(
    store: Map<string, Map<string, string>>,
    sessionId: string,
    messageId: string,
) {
    return Array.from((store.get(streamingKey(sessionId, messageId)) || new Map()).values()).join('\n').trim()
}

function updateStreamingPartStore(
    store: Map<string, Map<string, string>>,
    sessionId: string,
    messageId: string,
    partId: string,
    nextValue: string,
) {
    const key = streamingKey(sessionId, messageId)
    const partMap = store.get(key) || new Map<string, string>()
    partMap.set(partId, nextValue)
    store.set(key, partMap)
    return key
}

function removeStreamingPartStoreEntry(
    store: Map<string, Map<string, string>>,
    sessionId: string,
    messageId: string,
    partId: string,
) {
    const key = streamingKey(sessionId, messageId)
    const partMap = store.get(key)
    if (partMap) {
        partMap.delete(partId)
        if (partMap.size === 0) {
            store.delete(key)
        }
    }
    return key
}

function flushPendingActPerformerUpdates(set: (partial: any) => void) {
    if (pendingActPerformerUpdates.size === 0) {
        pendingActPerformerFlushTimer = null
        return
    }

    set((state: StudioState) => {
        let nextActPerformerChats = state.actPerformerChats

        for (const [key, updaters] of pendingActPerformerUpdates.entries()) {
            const separatorIndex = key.indexOf('::')
            if (separatorIndex === -1) {
                continue
            }
            const actSessionId = key.slice(0, separatorIndex)
            const performerSessionId = key.slice(separatorIndex + 2)
            const currentSessionChats = nextActPerformerChats[actSessionId] || {}
            let nextMessages = currentSessionChats[performerSessionId] || []
            for (const updater of updaters) {
                nextMessages = updater(nextMessages)
            }
            nextActPerformerChats = {
                ...nextActPerformerChats,
                [actSessionId]: {
                    ...currentSessionChats,
                    [performerSessionId]: nextMessages,
                },
            }
        }

        pendingActPerformerUpdates.clear()
        pendingActPerformerFlushTimer = null
        return {
            actPerformerChats: nextActPerformerChats,
        }
    })
}

function scheduleActPerformerMessageUpdate(
    set: (partial: any) => void,
    target: Extract<SessionStreamTarget, { kind: 'act-performer' }>,
    updater: (messages: ChatMessage[]) => ChatMessage[],
) {
    const key = `${target.actSessionId}::${target.performerSessionId}`
    const pending = pendingActPerformerUpdates.get(key) || []
    pending.push(updater)
    pendingActPerformerUpdates.set(key, pending)

    if (pendingActPerformerFlushTimer !== null) {
        return
    }

    pendingActPerformerFlushTimer = window.setTimeout(() => {
        flushPendingActPerformerUpdates(set)
    }, 48)
}

function applyTargetMessageUpdate(
    set: (partial: any) => void,
    target: SessionStreamTarget,
    updater: (messages: ChatMessage[]) => ChatMessage[],
) {
    if (target.kind === 'act-performer') {
        scheduleActPerformerMessageUpdate(set, target, updater)
        return
    }

    set((state: StudioState) => updateTargetMessages(state, target, updater))
}

function upsertStreamingAssistant(
    messages: ChatMessage[],
    messageId: string,
    content: string,
    timestamp = Date.now(),
) {
    return upsertAssistantStreamingMessage(messages, messageId, content, timestamp)
}

/**
 * Upsert a structured part into an assistant message's parts array.
 * Creates the message if it doesn't exist yet.
 */
function upsertMessagePart(
    messages: ChatMessage[],
    messageId: string,
    part: ChatMessagePart,
): ChatMessage[] {
    const next = [...messages]
    let idx = next.findIndex((m) => m.id === messageId)
    if (idx === -1) {
        next.push({
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            parts: [part],
        })
        return next
    }

    const msg = next[idx]
    const existingParts = msg.parts ? [...msg.parts] : []
    const partIdx = existingParts.findIndex((p) => p.id === part.id)
    if (partIdx === -1) {
        existingParts.push(part)
    } else {
        existingParts[partIdx] = part
    }
    next[idx] = { ...msg, parts: existingParts }
    return next
}

function removeMessagePart(
    messages: ChatMessage[],
    messageId: string,
    partId: string,
): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((message) => message.id === messageId)
    if (idx === -1) {
        return next
    }

    const message = next[idx]
    if (!message.parts?.length) {
        return next
    }

    const remainingParts = message.parts.filter((part) => part.id !== partId)
    next[idx] = { ...message, parts: remainingParts }
    return next
}

function resolveCurrentActSessionId(state: StudioState): string | null {
    if (state.selectedActSessionId) {
        return state.selectedActSessionId
    }
    if (state.selectedActId) {
        return state.actSessionMap[state.selectedActId] || null
    }
    return null
}

function extractEventErrorMessage(error: any): string {
    if (typeof error?.data?.message === 'string' && error.data.message.trim()) {
        return error.data.message.trim()
    }
    if (typeof error?.message === 'string' && error.message.trim()) {
        return error.message.trim()
    }
    return 'OpenCode session failed.'
}

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
            eventSourceInstance = null
        }

        eventSourceWorkingDir = workingDir
        eventSourceInstance = api.chat.events()
        eventSourceInstance.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)

                if (data.type === 'lsp.client.diagnostics') {
                    const { uri, diagnostics } = data.properties || {}
                    if (typeof uri !== 'string' || !diagnosticMatchesWorkingDir(uri, get().workingDir)) {
                        return
                    }
                    set((state) => ({
                        lspDiagnostics: {
                            ...state.lspDiagnostics,
                            [uri]: diagnostics,
                        },
                    }))
                    return
                }

                if (data.type === 'lsp.updated') {
                    get().fetchLspStatus()
                    return
                }

                if (data.type === 'mcp.tools.changed') {
                    const workingDir = get().workingDir
                    invalidateRuntimeQueries(workingDir)
                    return
                }

                if (data.type === 'mcp.browser.open.failed') {
                    const mcpName = data.properties?.mcpName
                    const url = data.properties?.url
                    if (typeof mcpName !== 'string' || typeof url !== 'string' || !url.trim()) {
                        return
                    }
                    showToast(`Studio could not open the browser for MCP auth (${mcpName}).`, 'warning', {
                        title: 'MCP auth needs browser',
                        actionLabel: 'Open auth',
                        onAction: () => {
                            window.open(url, '_blank')
                        },
                        dedupeKey: `mcp-auth-open:${mcpName}`,
                        durationMs: 8000,
                    })
                    return
                }

                if (data.type === 'message.updated') {
                    const info = data.properties?.info
                    if (!info?.sessionID || !info?.id || typeof info.role !== 'string') {
                        return
                    }

                    if (info.role === 'user' || info.role === 'assistant' || info.role === 'system') {
                        streamingMessageRoles.set(
                            streamingMessageKey(info.sessionID, info.id),
                            info.role,
                        )
                    }

                    if (info.role !== 'assistant') {
                        return
                    }
                    const target = resolveSessionTarget(get(), info.sessionID)
                    if (!target) {
                        return
                    }

                    applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(
                        messages,
                        info.id,
                        messages.find((message) => message.id === info.id)?.content || '',
                        info.time?.created || Date.now(),
                    ))
                    return
                }

                if (data.type === 'message.part.updated') {
                    const part = data.properties?.part
                    if (!part?.sessionID || !part?.messageID) {
                        return
                    }

                    const messageRole = streamingMessageRoles.get(
                        streamingMessageKey(part.sessionID, part.messageID),
                    )
                    if (messageRole !== 'assistant') {
                        return
                    }

                    const target = resolveSessionTarget(get(), part.sessionID)
                    if (!target) {
                        return
                    }

                    // ── Text parts (streaming) ──
                    if (part.type === 'text') {
                        updateStreamingPartStore(
                            streamingTextParts,
                            part.sessionID,
                            part.messageID,
                            part.id,
                            typeof part.text === 'string' ? part.text : '',
                        )
                        streamingPartKinds.set(
                            streamingPartKey(part.sessionID, part.messageID, part.id),
                            'text',
                        )
                        const content = streamingPartContent(streamingTextParts, part.sessionID, part.messageID)

                        applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(
                            messages,
                            part.messageID,
                            content,
                        ))
                        return
                    }

                    // ── Reasoning parts ──
                    if (part.type === 'reasoning') {
                        updateStreamingPartStore(
                            streamingReasoningParts,
                            part.sessionID,
                            part.messageID,
                            part.id,
                            typeof part.text === 'string' ? part.text : '',
                        )
                        streamingPartKinds.set(
                            streamingPartKey(part.sessionID, part.messageID, part.id),
                            'reasoning',
                        )
                        const reasoningPart: ChatMessagePart = {
                            id: part.id,
                            type: 'reasoning',
                            content: streamingReasoningParts.get(streamingKey(part.sessionID, part.messageID))?.get(part.id) || '',
                        }
                        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(
                            messages,
                            part.messageID,
                            reasoningPart,
                        ))
                        return
                    }

                    // ── Tool parts ──
                    if (part.type === 'tool') {
                        const state = part.state || {}
                        const toolPart: ChatMessagePart = {
                            id: part.id,
                            type: 'tool',
                            tool: {
                                name: part.tool || 'unknown',
                                callId: part.callID || part.id,
                                status: state.status || 'pending',
                                title: state.title,
                                input: state.input,
                                output: state.output,
                                error: state.error,
                                time: state.time,
                            },
                        }
                        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(
                            messages,
                            part.messageID,
                            toolPart,
                        ))
                        return
                    }

                    // ── Step parts ──
                    if (part.type === 'step-start' || part.type === 'step-finish') {
                        const stepPart: ChatMessagePart = {
                            id: part.id,
                            type: part.type,
                            step: part.type === 'step-finish' ? {
                                reason: part.reason,
                                cost: part.cost,
                                tokens: part.tokens,
                            } : undefined,
                        }
                        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(
                            messages,
                            part.messageID,
                            stepPart,
                        ))
                        return
                    }

                    // ── Compaction parts ──
                    if (part.type === 'compaction') {
                        const compactionPart: ChatMessagePart = {
                            id: part.id,
                            type: 'compaction',
                            compaction: {
                                auto: !!part.auto,
                                overflow: part.overflow,
                            },
                        }
                        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(
                            messages,
                            part.messageID,
                            compactionPart,
                        ))
                        return
                    }

                    return
                }

                if (data.type === 'message.part.delta') {
                    const { sessionID, messageID, partID, field, delta } = data.properties || {}
                    if (!sessionID || !messageID || !partID || field !== 'text' || typeof delta !== 'string') {
                        return
                    }

                    const messageRole = streamingMessageRoles.get(
                        streamingMessageKey(sessionID, messageID),
                    )
                    if (messageRole !== 'assistant') {
                        return
                    }

                    const target = resolveSessionTarget(get(), sessionID)
                    if (!target) {
                        return
                    }

                    const partKind = streamingPartKinds.get(
                        streamingPartKey(sessionID, messageID, partID),
                    )

                    if (partKind === 'text') {
                        const current = streamingTextParts.get(streamingKey(sessionID, messageID))?.get(partID) || ''
                        updateStreamingPartStore(streamingTextParts, sessionID, messageID, partID, `${current}${delta}`)
                        const content = streamingPartContent(streamingTextParts, sessionID, messageID)

                        applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(
                            messages,
                            messageID,
                            content,
                        ))
                        return
                    }

                    if (partKind === 'reasoning') {
                        const current = streamingReasoningParts.get(streamingKey(sessionID, messageID))?.get(partID) || ''
                        updateStreamingPartStore(streamingReasoningParts, sessionID, messageID, partID, `${current}${delta}`)

                        const reasoningPart: ChatMessagePart = {
                            id: partID,
                            type: 'reasoning',
                            content: streamingReasoningParts.get(streamingKey(sessionID, messageID))?.get(partID) || '',
                        }
                        applyTargetMessageUpdate(set, target, (messages) => upsertMessagePart(
                            messages,
                            messageID,
                            reasoningPart,
                        ))
                    }
                    return
                }

                if (data.type === 'message.part.removed') {
                    const { sessionID, messageID, partID } = data.properties || {}
                    if (!sessionID || !messageID || !partID) {
                        return
                    }

                    const messageRole = streamingMessageRoles.get(
                        streamingMessageKey(sessionID, messageID),
                    )
                    if (messageRole !== 'assistant') {
                        return
                    }

                    const target = resolveSessionTarget(get(), sessionID)
                    if (!target) {
                        return
                    }

                    const partKind = streamingPartKinds.get(streamingPartKey(sessionID, messageID, partID))
                    if (partKind === 'text') {
                        removeStreamingPartStoreEntry(streamingTextParts, sessionID, messageID, partID)
                        streamingPartKinds.delete(streamingPartKey(sessionID, messageID, partID))

                        const content = streamingPartContent(streamingTextParts, sessionID, messageID)
                        applyTargetMessageUpdate(set, target, (messages) => upsertStreamingAssistant(
                            messages,
                            messageID,
                            content,
                        ))
                        return
                    }

                    if (partKind === 'reasoning') {
                        removeStreamingPartStoreEntry(streamingReasoningParts, sessionID, messageID, partID)
                        streamingPartKinds.delete(streamingPartKey(sessionID, messageID, partID))
                        applyTargetMessageUpdate(set, target, (messages) => removeMessagePart(
                            messages,
                            messageID,
                            partID,
                        ))
                        return
                    }

                    return
                }

                if (data.type === 'session.status') {
                    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
                    if (!context) {
                        return
                    }
                    const { sessionId, target } = context
                    const statusType = data.properties?.status?.type
                    if (statusType === 'busy' && target.kind === 'performer') {
                        set({ loadingPerformerId: target.performerId })
                    } else if (statusType === 'retry') {
                        applyTargetMessageUpdate(set, target, (messages) => {
                            const retryMsgId = `retry-${sessionId}`
                            const retryIndex = messages.findIndex((message) => message.id === retryMsgId)
                            const newContent = `⏳ Retrying (Attempt ${data.properties?.status?.attempt}): ${data.properties?.status?.message || 'Operation failed, retrying...'}`

                            if (retryIndex >= 0) {
                                const nextMessages = [...messages]
                                nextMessages[retryIndex] = { ...nextMessages[retryIndex], content: newContent }
                                return nextMessages
                            }

                            return [
                                ...messages,
                                {
                                    id: retryMsgId,
                                    role: 'system',
                                    content: newContent,
                                    timestamp: Date.now(),
                                },
                            ]
                        })
                    }
                    return
                }

                if (data.type === 'session.idle') {
                    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
                    if (!context) {
                        return
                    }
                    const { sessionId, target } = context
                    if (target.kind === 'performer' && get().loadingPerformerId === target.performerId) {
                        set({ loadingPerformerId: null })
                    }
                    void syncSessionMessages(target, sessionId)
                    return
                }

                if (data.type === 'session.compacted') {
                    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
                    if (!context) {
                        return
                    }
                    const { sessionId, target } = context
                    void syncSessionMessages(target, sessionId)
                    return
                }

                if (data.type === 'session.error') {
                    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
                    if (!context) {
                        return
                    }
                    const { sessionId, target } = context

                    clearStreamingSession(sessionId)

                    if (target.kind === 'performer' && get().loadingPerformerId === target.performerId) {
                        set({ loadingPerformerId: null })
                    }

                    applyTargetMessageUpdate(set, target, (messages) => [
                        ...messages,
                        {
                            id: `system-${Date.now()}`,
                            role: 'system',
                            content: `⚠️ ${extractEventErrorMessage(data.properties?.error)}`,
                            timestamp: Date.now(),
                        },
                    ])
                }
            } catch {
                // Ignore malformed events and keep the stream alive.
            }
        }

        eventSourceInstance.onerror = () => {
            if (eventSourceInstance) {
                eventSourceInstance.close()
                eventSourceInstance = null
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
            actEventSourceInstance = null
        }

        actEventSourceWorkingDir = workingDir
        actEventSourceSessionId = actSessionId

        if (!actSessionId) {
            return
        }

        actEventSourceInstance = api.act.events(actSessionId)
        actEventSourceInstance.onmessage = (event) => {
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

        actEventSourceInstance.onerror = () => {
            if (actEventSourceInstance) {
                actEventSourceInstance.close()
                actEventSourceInstance = null
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
            adapterEventSourceInstance = null
        }

        adapterEventSourceWorkingDir = workingDir
        adapterEventSourceInstance = api.adapter.events()
        adapterEventSourceInstance.onmessage = (event) => {
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

        adapterEventSourceInstance.onerror = () => {
            if (adapterEventSourceInstance) {
                adapterEventSourceInstance.close()
                adapterEventSourceInstance = null
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
                eventSourceInstance = null
            }
            if (actEventSourceInstance) {
                actEventSourceInstance.close()
                actEventSourceInstance = null
            }
            if (adapterEventSourceInstance) {
                adapterEventSourceInstance.close()
                adapterEventSourceInstance = null
            }
            eventSourceWorkingDir = null
            actEventSourceWorkingDir = null
            actEventSourceSessionId = null
            adapterEventSourceWorkingDir = null
            streamingTextParts.clear()
            syncingSessions.clear()
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
