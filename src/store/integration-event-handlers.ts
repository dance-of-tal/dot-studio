/**
 * Event handlers for the chat EventSource stream.
 *
 * Each handler corresponds to one SSE event type inside `reconnectEventSource.onmessage`.
 * They are pure functions of `(data, get, set)` so the dispatcher in integrationSlice
 * stays thin.
 */

import type { ChatMessagePart } from '../types'
import type { StudioState } from './types'
import type { SessionStreamTarget } from './integration-streaming'
import {
    applyTargetMessageUpdate,
    clearStreamingSession,
    diagnosticMatchesWorkingDir,
    extractEventErrorMessage,
    invalidateRuntimeQueries,
    removeMessagePart,
    removeStreamingPartStoreEntry,
    resolveEventSessionContext,
    resolveSessionTarget,
    streamingKey,
    streamingMessageKey,
    streamingMessageRoles,
    streamingPartContent,
    streamingPartKey,
    streamingPartKinds,
    streamingReasoningParts,
    streamingTextParts,
    updateStreamingPartStore,
    upsertMessagePart,
    upsertStreamingAssistant,
} from './integration-streaming'
import { showToast } from '../lib/toast'
import { handleAssistantToolCall } from '../features/assistant/assistant-actions'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

// ── lsp.client.diagnostics ──

export function handleLspDiagnostics(
    data: any,
    get: GetFn,
    set: SetFn,
) {
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
}

// ── lsp.updated ──

export function handleLspUpdated(get: GetFn) {
    get().fetchLspStatus()
}

// ── mcp.tools.changed ──

export function handleMcpToolsChanged(get: GetFn) {
    invalidateRuntimeQueries(get().workingDir)
}

// ── mcp.browser.open.failed ──

export function handleMcpBrowserOpenFailed(data: any) {
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
}

// ── message.updated ──

export function handleMessageUpdated(
    data: any,
    get: GetFn,
    set: SetFn,
) {
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
}

// ── message.part.updated ──

export function handleMessagePartUpdated(
    data: any,
    get: GetFn,
    set: SetFn,
) {
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

        // Auto-execute assistant tools on completion
        if (target.kind === 'performer' && target.performerId === 'studio-assistant' && state.status === 'completed' && part.tool?.startsWith('assistant_')) {
            // Ensure we only execute once (we can check if it already ran, but state.status edge is safe enough)
            // Wait, part.state is what we have. Let's use requestAnimationFrame or just execute it directly.
            // A better way is to see if we haven't executed it yet. Since integration handlers are idempotent-ish,
            // we should probably check if it was already executed. But for Studio Assistant V1, this is fine.
            if (state.input) {
                // Wait for part to be updated in store, then execute
                setTimeout(() => {
                    handleAssistantToolCall(part.callID || part.id, part.tool, state.input)
                }, 10)
            }
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
}

// ── message.part.delta ──

export function handleMessagePartDelta(
    data: any,
    get: GetFn,
    set: SetFn,
) {
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
}

// ── message.part.removed ──

export function handleMessagePartRemoved(
    data: any,
    get: GetFn,
    set: SetFn,
) {
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
}

// ── session.status ──

export function handleSessionStatus(
    data: any,
    get: GetFn,
    set: SetFn,
) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) {
        return
    }
    const { sessionId, target } = context
    const statusType = data.properties?.status?.type
    if (statusType === 'busy' && target.kind === 'performer') {
        set({ loadingPerformerId: target.performerId })
    } else if (statusType === 'busy' && target.kind === 'act-participant') {
        set({ loadingPerformerId: target.chatKey })
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
}

// ── session.idle ──

export function handleSessionIdle(
    data: any,
    get: GetFn,
    set: SetFn,
    syncSessionMessages: (target: SessionStreamTarget, sessionId: string) => void,
) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) {
        return
    }
    const { sessionId, target } = context
    if (
        (target.kind === 'performer' && get().loadingPerformerId === target.performerId)
        || (target.kind === 'act-participant' && get().loadingPerformerId === target.chatKey)
    ) {
        set({ loadingPerformerId: null })
    }
    void syncSessionMessages(target, sessionId)
}

// ── session.compacted ──

export function handleSessionCompacted(
    data: any,
    get: GetFn,
    _set: SetFn,
    syncSessionMessages: (target: SessionStreamTarget, sessionId: string) => void,
) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) {
        return
    }
    const { sessionId, target } = context
    void syncSessionMessages(target, sessionId)
}



// ── session.error ──

export function handleSessionError(
    data: any,
    get: GetFn,
    set: SetFn,
) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) {
        return
    }
    const { sessionId, target } = context

    clearStreamingSession(sessionId)

    if (
        (target.kind === 'performer' && get().loadingPerformerId === target.performerId)
        || (target.kind === 'act-participant' && get().loadingPerformerId === target.chatKey)
    ) {
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

// ── permission.asked ──

export function handlePermissionAsked(
    data: any,
    get: GetFn,
    set: SetFn,
) {
    const request = data.properties
    if (!request || !request.sessionID || !request.id) {
        return
    }

    const context = resolveEventSessionContext(get(), request.sessionID)
    if (!context) {
        return
    }

    // The session is now paused waiting for user approval — clear the
    // loading spinner so the permission UI is visible and the composer
    // is not disabled.
    const { target } = context
    set((state) => ({
        pendingPermissions: {
            ...state.pendingPermissions,
            [request.sessionID]: request,
        },
        ...((target.kind === 'performer' && state.loadingPerformerId === target.performerId)
            || (target.kind === 'act-participant' && state.loadingPerformerId === target.chatKey)
            ? { loadingPerformerId: null }
            : {}),
    }))
}

// ── permission.replied ──

export function handlePermissionReplied(
    data: any,
    _get: GetFn,
    set: SetFn,
) {
    const replyInfo = data.properties
    if (!replyInfo || !replyInfo.sessionID) {
        return
    }

    set((state) => {
        const next = { ...state.pendingPermissions }
        delete next[replyInfo.sessionID]
        return { pendingPermissions: next }
    })
}

// ── question.asked ──

export function handleQuestionAsked(
    data: any,
    get: GetFn,
    set: SetFn,
) {
    const request = data.properties
    if (!request || !request.sessionID || !request.id) {
        return
    }

    const context = resolveEventSessionContext(get(), request.sessionID)
    if (!context) {
        return
    }

    // The session is now paused waiting for user answers — clear the
    // loading spinner so the question UI is visible.
    const { target } = context
    set((state) => ({
        pendingQuestions: {
            ...state.pendingQuestions,
            [request.sessionID]: request,
        },
        ...((target.kind === 'performer' && state.loadingPerformerId === target.performerId)
            || (target.kind === 'act-participant' && state.loadingPerformerId === target.chatKey)
            ? { loadingPerformerId: null }
            : {}),
    }))
}

// ── question.replied ──

export function handleQuestionReplied(
    data: any,
    _get: GetFn,
    set: SetFn,
) {
    const replyInfo = data.properties
    if (!replyInfo || !replyInfo.sessionID) {
        return
    }

    set((state) => {
        const next = { ...state.pendingQuestions }
        delete next[replyInfo.sessionID]
        return { pendingQuestions: next }
    })
}

// ── todo.updated ──

export function handleTodoUpdated(
    data: any,
    _get: GetFn,
    set: SetFn,
) {
    const payload = data.properties
    if (!payload || !payload.sessionID || !payload.todos) {
        return
    }

    set((state) => ({
        todos: {
            ...state.todos,
            [payload.sessionID]: payload.todos,
        },
    }))
}
