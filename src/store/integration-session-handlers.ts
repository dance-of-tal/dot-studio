import type { StudioState } from './types'
import type { SessionStreamTarget } from './integration-streaming'
import type { ChatMessage } from '../types'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'
import {
    applyTargetMessageUpdate,
    clearStreamingSession,
    extractEventErrorMessage,
    resolveEventSessionContext,
} from './integration-streaming'
import { api } from '../api'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

type SessionStatusEvent = {
    properties?: {
        sessionID?: string
        status?: {
            type?: string
            attempt?: number
            message?: string
        }
    }
}

type SessionIdEvent = {
    properties?: {
        sessionID?: string
    }
}

type SessionErrorEvent = {
    properties?: {
        sessionID?: string
        error?: unknown
    }
}

type PermissionEvent = {
    properties?: PermissionRequest
}

type QuestionEvent = {
    properties?: QuestionRequest
}

type TodoEvent = {
    properties?: {
        sessionID?: string
        todos?: Todo[]
    }
}

const summarizedSessions = new Set<string>()

export function handleSessionStatus(data: SessionStatusEvent, get: GetFn, set: SetFn) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) return
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

export function handleSessionIdle(
    data: SessionIdEvent,
    get: GetFn,
    set: SetFn,
    syncSessionMessages: (target: SessionStreamTarget, sessionId: string) => void,
) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) return
    const { sessionId, target } = context
    if (
        (target.kind === 'performer' && get().loadingPerformerId === target.performerId)
        || (target.kind === 'act-participant' && get().loadingPerformerId === target.chatKey)
    ) {
        set({ loadingPerformerId: null })
    }
    void syncSessionMessages(target, sessionId)

    // Auto-title on first idle: extract title from first user message
    if (!summarizedSessions.has(sessionId)) {
        summarizedSessions.add(sessionId)
        const chatKey = target.kind === 'performer' ? target.performerId : target.chatKey
        const messages = get().chats[chatKey] || []
        const firstUserMsg = messages.find((message: ChatMessage) => message.role === 'user')
        if (firstUserMsg) {
            const rawText = (firstUserMsg.content || '').replace(/\n/g, ' ').trim()
            const shortTitle = rawText.length > 50 ? rawText.slice(0, 47) + '...' : rawText
            if (shortTitle) {
                const sessions = get().sessions || []
                const session = sessions.find((entry) => entry.id === sessionId)
                if (session?.title) {
                    void (async () => {
                        const { renameStudioSessionTitle } = await import('../../shared/session-metadata')
                        const newTitle = renameStudioSessionTitle(session.title, shortTitle)
                        if (newTitle) {
                            api.chat.updateSession(sessionId, newTitle)
                                .then(() => get().listSessions())
                                .catch(() => { /* ignore rename failures */ })
                        }
                    })()
                }
            }
        }
    }
}

export function handleSessionCompacted(
    data: SessionIdEvent,
    get: GetFn,
    _set: SetFn,
    syncSessionMessages: (target: SessionStreamTarget, sessionId: string) => void,
) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) return
    const { sessionId, target } = context
    void syncSessionMessages(target, sessionId)
}

export function handleSessionError(data: SessionErrorEvent, get: GetFn, set: SetFn) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) return
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

export function handlePermissionAsked(data: PermissionEvent, get: GetFn, set: SetFn) {
    const request = data.properties
    if (!request || !request.sessionID || !request.id) return

    const context = resolveEventSessionContext(get(), request.sessionID)
    if (!context) return

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

export function handlePermissionReplied(data: PermissionEvent, _get: GetFn, set: SetFn) {
    const replyInfo = data.properties
    if (!replyInfo || !replyInfo.sessionID) return

    set((state) => {
        const next = { ...state.pendingPermissions }
        delete next[replyInfo.sessionID]
        return { pendingPermissions: next }
    })
}

export function handleQuestionAsked(data: QuestionEvent, get: GetFn, set: SetFn) {
    const request = data.properties
    if (!request || !request.sessionID || !request.id) return

    const context = resolveEventSessionContext(get(), request.sessionID)
    if (!context) return

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

export function handleQuestionReplied(data: QuestionEvent, _get: GetFn, set: SetFn) {
    const replyInfo = data.properties
    if (!replyInfo || !replyInfo.sessionID) return

    set((state) => {
        const next = { ...state.pendingQuestions }
        delete next[replyInfo.sessionID]
        return { pendingQuestions: next }
    })
}

export function handleTodoUpdated(data: TodoEvent, _get: GetFn, set: SetFn) {
    const payload = data.properties
    if (!payload || !payload.sessionID || !payload.todos) return

    set((state) => ({
        todos: {
            ...state.todos,
            [payload.sessionID]: payload.todos,
        },
    }))
}
