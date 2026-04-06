import { api } from '../../api'
import { logChatDebug, summarizeMessagesForChatDebug } from '../../lib/chat-debug'
import type { ChatMessage } from '../../types'
import { parseActParticipantChatKey } from '../../../shared/chat-targets'
import type { StudioState } from '../types'
import { resolveSessionActivity } from '../session/session-activity'
import {
    ACT_THREAD_RECOVERY_MAX_POLLS,
    createInitialActRecoveryState,
    isActRecoverySettled,
    syncActRecoveryParticipants,
} from './act-chat-recovery'

const STREAM_RECOVERY_GRACE_MS = 1200
const STREAM_RECOVERY_POLL_MS = 1000
const STREAM_RECOVERY_MAX_POLLS = 45

type SessionStatusLike = {
    type: 'idle' | 'busy' | 'retry' | 'error'
    attempt?: number
    message?: string
}

type RecoveryGet = () => StudioState
type RecoverySet = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void

type RecoveryOptions = {
    get: RecoveryGet
    set: RecoverySet
    syncSessionMessages: (chatKey: string, sessionId: string) => Promise<{ messages: ChatMessage[] } | null>
    setSessionStatus: (sessionId: string, status: SessionStatusLike) => void
    setSessionLoading: (sessionId: string, loading: boolean) => void
}

type ChatEventLike = {
    type?: string
    properties?: Record<string, unknown>
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildSnapshotSignature(messages: ChatMessage[]) {
    return messages
        .map((message) => `${message.id}:${message.role}:${message.timestamp}:${message.content.length}`)
        .join('|')
}

function hasSettledAssistantReply(messages: ChatMessage[]) {
    let latestUserIndex = -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'user') {
            latestUserIndex = index
            break
        }
    }

    const tail = latestUserIndex >= 0 ? messages.slice(latestUserIndex + 1) : messages
    return tail.some((message) => (
        (message.role === 'assistant' || message.role === 'system')
        && !message.id.startsWith('temp-')
        && message.content.trim().length > 0
    ))
}

function hasPendingInteractiveTurn(get: RecoveryGet, sessionId: string) {
    const state = get()
    return !!(state.sePermissions[sessionId] || state.seQuestions[sessionId])
}

function readEventStatus(event: ChatEventLike) {
    const status = event.properties?.status
    if (!status || typeof status !== 'object') {
        return null
    }

    const type = (status as { type?: unknown }).type
    if (type !== 'idle' && type !== 'busy' && type !== 'retry' && type !== 'error') {
        return null
    }

    return type
}

export function shouldStartActSessionRecovery(event: ChatEventLike) {
    if (!event.type) {
        return false
    }

    if (event.type.startsWith('message.')) {
        return true
    }

    if (event.type !== 'session.status') {
        return false
    }

    const statusType = readEventStatus(event)
    return statusType === 'busy' || statusType === 'retry'
}

export function shouldStopSessionRecovery(event: ChatEventLike) {
    if (!event.type) {
        return false
    }

    if (event.type === 'session.idle' || event.type === 'session.error') {
        return true
    }

    if (event.type !== 'session.status') {
        return false
    }

    const statusType = readEventStatus(event)
    return statusType === 'idle' || statusType === 'error'
}

export function createSessionRecoveryCoordinator(options: RecoveryOptions) {
    const { get, set, syncSessionMessages, setSessionStatus, setSessionLoading } = options
    const activeRecoveryPolls = new Map<string, symbol>()

    const stop = (sessionId: string) => {
        activeRecoveryPolls.delete(sessionId)
    }

    const dispose = () => {
        activeRecoveryPolls.clear()
    }

    const isRunning = (sessionId: string) => activeRecoveryPolls.has(sessionId)

    const schedule = (chatKey: string, sessionId: string) => {
        if (activeRecoveryPolls.has(sessionId)) {
            return
        }

        const recoveryToken = Symbol(sessionId)
        activeRecoveryPolls.set(sessionId, recoveryToken)
        const actTarget = parseActParticipantChatKey(chatKey)

        void (async () => {
            try {
                await sleep(STREAM_RECOVERY_GRACE_MS)
                if (activeRecoveryPolls.get(sessionId) !== recoveryToken) {
                    return
                }

                let lastSnapshotSignature: string | null = null
                let stableSnapshotPolls = 0
                let actRecoveryState = createInitialActRecoveryState(!!actTarget)
                logChatDebug('fallback', 'start recovery polling', { chatKey, sessionId })

                const recoveryMaxPolls = actTarget ? ACT_THREAD_RECOVERY_MAX_POLLS : STREAM_RECOVERY_MAX_POLLS

                for (let attempt = 0; attempt < recoveryMaxPolls; attempt++) {
                    if (activeRecoveryPolls.get(sessionId) !== recoveryToken) {
                        return
                    }

                    const state = get()
                    if (state.chatKeyToSession[chatKey] !== sessionId) {
                        logChatDebug('fallback', 'stop recovery polling: binding changed', { chatKey, sessionId, attempt })
                        return
                    }

                    try {
                        let actThreadHasActiveSessions = false
                        let status: Awaited<ReturnType<typeof api.chat.status>>['status'] | undefined
                        if (actTarget) {
                            const actRecovery = await syncActRecoveryParticipants({
                                set,
                                get,
                                chatKey,
                                sessionId,
                                actTarget,
                                attempt,
                                state: actRecoveryState,
                            })
                            actRecoveryState = actRecovery.state
                            actThreadHasActiveSessions = actRecovery.hasActiveSessions
                            status = actRecovery.primaryStatus
                        }

                        if (typeof status === 'undefined') {
                            const statusResult = await api.chat.status(sessionId)
                            status = statusResult.status
                        }
                        const snapshot = await syncSessionMessages(chatKey, sessionId).catch(() => null)
                        if (get().chatKeyToSession[chatKey] !== sessionId) {
                            return
                        }

                        if (snapshot) {
                            const snapshotSignature = buildSnapshotSignature(snapshot.messages)
                            stableSnapshotPolls = snapshotSignature === lastSnapshotSignature
                                ? stableSnapshotPolls + 1
                                : 0
                            lastSnapshotSignature = snapshotSignature
                            logChatDebug('fallback', 'polled session snapshot', {
                                chatKey,
                                sessionId,
                                attempt,
                                status: status?.type || null,
                                stableSnapshotPolls,
                                stableActThreadPolls: actRecoveryState.stableThreadPolls,
                                messages: summarizeMessagesForChatDebug(snapshot.messages),
                            })
                        }

                        const actThreadStableEnough = isActRecoverySettled(actTarget, actRecoveryState, actThreadHasActiveSessions)

                        if (status?.type === 'busy' || status?.type === 'retry' || status?.type === 'idle' || status?.type === 'error') {
                            setSessionStatus(sessionId, status)
                            setSessionLoading(sessionId, false)
                            if ((status.type === 'idle' || status.type === 'error') && actThreadStableEnough) {
                                logChatDebug('fallback', 'stop recovery polling: status settled', {
                                    chatKey,
                                    sessionId,
                                    attempt,
                                    status: status.type,
                                    stableActThreadPolls: actRecoveryState.stableThreadPolls,
                                    lastActThreadActivityAt: actRecoveryState.lastThreadActivityAt,
                                })
                                return
                            }
                        }

                        const currentActivity = resolveSessionActivity({
                            loading: !!get().sessionLoading[sessionId],
                            status: get().seStatuses[sessionId] || status,
                            messages: get().seMessages[sessionId] || snapshot?.messages || [],
                            permission: get().sePermissions[sessionId] || null,
                            question: get().seQuestions[sessionId] || null,
                        })

                        if (
                            snapshot
                            && stableSnapshotPolls >= 1
                            && hasSettledAssistantReply(snapshot.messages)
                            && !hasPendingInteractiveTurn(get, sessionId)
                            && actThreadStableEnough
                            && (!status || status.type === 'busy' || status.type === 'retry')
                        ) {
                            setSessionStatus(sessionId, { type: 'idle' })
                            setSessionLoading(sessionId, false)
                            logChatDebug('fallback', 'stop recovery polling: snapshot heuristic settled stale status', {
                                chatKey,
                                sessionId,
                                attempt,
                                status: status?.type || null,
                                stableActThreadPolls: actRecoveryState.stableThreadPolls,
                                lastActThreadActivityAt: actRecoveryState.lastThreadActivityAt,
                                messages: summarizeMessagesForChatDebug(snapshot.messages),
                            })
                            return
                        }

                        if (!currentActivity.isTransportActive && actThreadStableEnough) {
                            logChatDebug('fallback', 'stop recovery polling: activity settled', {
                                chatKey,
                                sessionId,
                                attempt,
                                activityKind: currentActivity.kind,
                                stableActThreadPolls: actRecoveryState.stableThreadPolls,
                                lastActThreadActivityAt: actRecoveryState.lastThreadActivityAt,
                            })
                            return
                        }
                    } catch (error) {
                        logChatDebug('fallback', 'poll iteration failed', {
                            chatKey,
                            sessionId,
                            attempt,
                            error: error instanceof Error ? error.message : String(error),
                        })
                    }

                    await sleep(STREAM_RECOVERY_POLL_MS)
                }
                logChatDebug('fallback', 'recovery polling exhausted', { chatKey, sessionId })
            } finally {
                if (activeRecoveryPolls.get(sessionId) === recoveryToken) {
                    activeRecoveryPolls.delete(sessionId)
                }
            }
        })()
    }

    return {
        schedule,
        stop,
        dispose,
        isRunning,
    }
}
