import type { ActPerformerSessionBinding, ChatMessage, ChatMessagePart } from '../types'
import type { StudioState } from './types'
import { queryClient } from '../lib/query-client'
import { upsertAssistantStreamingMessage } from '../lib/chat-messages'

export let eventSourceInstance: EventSource | null = null
export let eventSourceWorkingDir: string | null = null
export let actEventSourceInstance: EventSource | null = null
export let actEventSourceWorkingDir: string | null = null
export let actEventSourceSessionId: string | null = null
export let adapterEventSourceInstance: EventSource | null = null
export let adapterEventSourceWorkingDir: string | null = null
export const streamingTextParts = new Map<string, Map<string, string>>()
export const streamingReasoningParts = new Map<string, Map<string, string>>()
export const streamingMessageRoles = new Map<string, 'user' | 'assistant' | 'system'>()
export const streamingPartKinds = new Map<string, 'text' | 'reasoning'>()
export const syncingSessions = new Set<string>()
export const pendingActPerformerUpdates = new Map<string, Array<(messages: ChatMessage[]) => ChatMessage[]>>()
export let pendingActPerformerFlushTimer: number | null = null

export function setEventSourceInstance(next: EventSource | null) {
    eventSourceInstance = next
}

export function setEventSourceWorkingDir(next: string | null) {
    eventSourceWorkingDir = next
}

export function setActEventSourceInstance(next: EventSource | null) {
    actEventSourceInstance = next
}

export function setActEventSourceWorkingDir(next: string | null) {
    actEventSourceWorkingDir = next
}

export function setActEventSourceSessionId(next: string | null) {
    actEventSourceSessionId = next
}

export function setAdapterEventSourceInstance(next: EventSource | null) {
    adapterEventSourceInstance = next
}

export function setAdapterEventSourceWorkingDir(next: string | null) {
    adapterEventSourceWorkingDir = next
}

export function setPendingActPerformerFlushTimer(next: number | null) {
    pendingActPerformerFlushTimer = next
}

export function diagnosticMatchesWorkingDir(uri: string, workingDir: string) {
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

export function streamingKey(sessionId: string, messageId: string) {
    return `${sessionId}:${messageId}`
}

export function streamingPartKey(sessionId: string, messageId: string, partId: string) {
    return `${sessionId}:${messageId}:${partId}`
}

export function streamingMessageKey(sessionId: string, messageId: string) {
    return `${sessionId}:${messageId}`
}

export function clearStreamingSession(sessionId: string) {
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

export type SessionStreamTarget =
    | { kind: 'performer'; performerId: string }
    | { kind: 'act-performer'; actSessionId: string; performerSessionId: string }

export function resolveSessionTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
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

export function updateTargetMessages(
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

export function invalidateRuntimeQueries(workingDir: string) {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers', workingDir] })
    queryClient.invalidateQueries({ queryKey: ['runtime-tools', workingDir] })
}

export function resolveEventSessionContext(
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

export function streamingPartContent(
    store: Map<string, Map<string, string>>,
    sessionId: string,
    messageId: string,
) {
    return Array.from((store.get(streamingKey(sessionId, messageId)) || new Map()).values()).join('\n').trim()
}

export function updateStreamingPartStore(
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

export function removeStreamingPartStoreEntry(
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

export function flushPendingActPerformerUpdates(set: (partial: any) => void) {
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

export function scheduleActPerformerMessageUpdate(
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

export function applyTargetMessageUpdate(
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

export function upsertStreamingAssistant(
    messages: ChatMessage[],
    messageId: string,
    content: string,
    timestamp = Date.now(),
) {
    return upsertAssistantStreamingMessage(messages, messageId, content, timestamp)
}

export function upsertMessagePart(
    messages: ChatMessage[],
    messageId: string,
    part: ChatMessagePart,
): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((message) => message.id === messageId)
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

    const message = next[idx]
    const existingParts = message.parts ? [...message.parts] : []
    const partIdx = existingParts.findIndex((existingPart) => existingPart.id === part.id)
    if (partIdx === -1) {
        existingParts.push(part)
    } else {
        existingParts[partIdx] = part
    }
    next[idx] = { ...message, parts: existingParts }
    return next
}

export function removeMessagePart(
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

export function resolveCurrentActSessionId(state: StudioState): string | null {
    if (state.selectedActSessionId) {
        return state.selectedActSessionId
    }
    if (state.selectedActId) {
        return state.actSessionMap[state.selectedActId] || null
    }
    return null
}

export function extractEventErrorMessage(error: any): string {
    if (typeof error?.data?.message === 'string' && error.data.message.trim()) {
        return error.data.message.trim()
    }
    if (typeof error?.message === 'string' && error.message.trim()) {
        return error.message.trim()
    }
    return 'OpenCode session failed.'
}

export function clearIntegrationStreamingState() {
    streamingTextParts.clear()
    streamingReasoningParts.clear()
    streamingMessageRoles.clear()
    streamingPartKinds.clear()
    syncingSessions.clear()
    pendingActPerformerUpdates.clear()
    pendingActPerformerFlushTimer = null
}
