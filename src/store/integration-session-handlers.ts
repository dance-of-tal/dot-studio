import type { StudioState } from './types'
import type { SessionStreamTarget } from './integration-streaming'
import {
    applyTargetMessageUpdate,
    clearStreamingSession,
    extractEventErrorMessage,
    resolveEventSessionContext,
} from './integration-streaming'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

export function handleSessionStatus(data: any, get: GetFn, set: SetFn) {
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
    data: any,
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
}

export function handleSessionCompacted(
    data: any,
    get: GetFn,
    _set: SetFn,
    syncSessionMessages: (target: SessionStreamTarget, sessionId: string) => void,
) {
    const context = resolveEventSessionContext(get(), data.properties?.sessionID)
    if (!context) return
    const { sessionId, target } = context
    void syncSessionMessages(target, sessionId)
}

export function handleSessionError(data: any, get: GetFn, set: SetFn) {
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

export function handlePermissionAsked(data: any, get: GetFn, set: SetFn) {
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

export function handlePermissionReplied(data: any, _get: GetFn, set: SetFn) {
    const replyInfo = data.properties
    if (!replyInfo || !replyInfo.sessionID) return

    set((state) => {
        const next = { ...state.pendingPermissions }
        delete next[replyInfo.sessionID]
        return { pendingPermissions: next }
    })
}

export function handleQuestionAsked(data: any, get: GetFn, set: SetFn) {
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

export function handleQuestionReplied(data: any, _get: GetFn, set: SetFn) {
    const replyInfo = data.properties
    if (!replyInfo || !replyInfo.sessionID) return

    set((state) => {
        const next = { ...state.pendingQuestions }
        delete next[replyInfo.sessionID]
        return { pendingQuestions: next }
    })
}

export function handleTodoUpdated(data: any, _get: GetFn, set: SetFn) {
    const payload = data.properties
    if (!payload || !payload.sessionID || !payload.todos) return

    set((state) => ({
        todos: {
            ...state.todos,
            [payload.sessionID]: payload.todos,
        },
    }))
}
