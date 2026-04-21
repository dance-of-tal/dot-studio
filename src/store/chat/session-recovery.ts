import { api } from '../../api'
import type { ChatMessage } from '../../types'
import { logChatDebug } from '../../lib/chat-debug'
import type { StudioState } from '../types'
import { createActor, fromCallback } from 'xstate'

const SESSION_SUPERVISION_START_GRACE_MS = 1200
const SESSION_SUPERVISION_POLL_MS = 1000
const SESSION_SUPERVISION_MAX_POLLS = 180

type SessionStatusLike = {
    type: 'idle' | 'busy' | 'retry' | 'error'
    attempt?: number
    message?: string
}

type RecoveryGet = () => StudioState

type RecoveryOptions = {
    get: RecoveryGet
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

function hasActiveAuthoritativeStatus(status: SessionStatusLike | null | undefined) {
    return status?.type === 'busy' || status?.type === 'retry'
}

function hasOptimisticLoading(get: RecoveryGet, sessionId: string) {
    return !!get().sessionLoading[sessionId]
}

function bindingChanged(get: RecoveryGet, chatKey: string, sessionId: string) {
    const state = get()
    const boundSessionId = state.chatKeyToSession[chatKey]
    if (boundSessionId && boundSessionId !== sessionId) {
        return true
    }

    const reverseBoundChatKey = state.sessionToChatKey[sessionId]
    return !!(reverseBoundChatKey && reverseBoundChatKey !== chatKey)
}

async function syncSnapshotSafely(
    syncSessionMessages: RecoveryOptions['syncSessionMessages'],
    chatKey: string,
    sessionId: string,
) {
    try {
        await syncSessionMessages(chatKey, sessionId)
    } catch {
        // Keep supervision alive even if a snapshot refresh fails once.
    }
}

export function shouldStartSessionSupervision(event: ChatEventLike) {
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

export function shouldStopSessionSupervision(event: ChatEventLike) {
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

export function createSessionSupervisor(options: RecoveryOptions) {
    const { get, syncSessionMessages, setSessionStatus, setSessionLoading } = options
    const activeSessions = new Map<string, { stop: () => void }>()

    const stop = (sessionId: string) => {
        const actor = activeSessions.get(sessionId)
        if (actor) {
            actor.stop()
            activeSessions.delete(sessionId)
        }
    }

    const dispose = () => {
        for (const actor of activeSessions.values()) {
            actor.stop()
        }
        activeSessions.clear()
    }

    const isRunning = (sessionId: string) => activeSessions.has(sessionId)

    const schedule = (chatKey: string, sessionId: string) => {
        if (activeSessions.has(sessionId)) {
            return
        }

        const actor = createActor(createSupervisionLogic({
            chatKey,
            sessionId,
            get,
            syncSessionMessages,
            setSessionStatus,
            setSessionLoading,
            onComplete: () => {
                const current = activeSessions.get(sessionId)
                if (current === actor) {
                    activeSessions.delete(sessionId)
                }
            },
        }))
        activeSessions.set(sessionId, actor)
        actor.start()
    }

    return {
        schedule,
        stop,
        dispose,
        isRunning,
    }
}

function createSupervisionLogic(input: {
    chatKey: string
    sessionId: string
    get: RecoveryGet
    syncSessionMessages: RecoveryOptions['syncSessionMessages']
    setSessionStatus: RecoveryOptions['setSessionStatus']
    setSessionLoading: RecoveryOptions['setSessionLoading']
    onComplete: () => void
}) {
    return fromCallback(() => {
        let cancelled = false
        void (async () => {
            const settledSnapshotSessions = new Set<string>()

            try {
                await sleep(SESSION_SUPERVISION_START_GRACE_MS)
                if (cancelled) {
                    return
                }

                logChatDebug('session-supervisor', 'start session supervision', {
                    chatKey: input.chatKey,
                    sessionId: input.sessionId,
                })

                for (let attempt = 0; attempt < SESSION_SUPERVISION_MAX_POLLS; attempt += 1) {
                    if (cancelled) {
                        return
                    }

                    if (bindingChanged(input.get, input.chatKey, input.sessionId)) {
                        logChatDebug('session-supervisor', 'stop session supervision: binding changed', {
                            chatKey: input.chatKey,
                            sessionId: input.sessionId,
                            attempt,
                        })
                        return
                    }

                    try {
                        const statusResult = await api.chat.status(input.sessionId)
                        const status = statusResult.status

                        if (status) {
                            input.setSessionStatus(input.sessionId, status)
                            input.setSessionLoading(input.sessionId, false)
                        }

                        if (hasActiveAuthoritativeStatus(status)) {
                            settledSnapshotSessions.delete(input.sessionId)
                            await syncSnapshotSafely(
                                input.syncSessionMessages,
                                input.chatKey,
                                input.sessionId,
                            )
                            await sleep(SESSION_SUPERVISION_POLL_MS)
                            continue
                        }

                        if ((status?.type === 'idle' || status?.type === 'error') && !settledSnapshotSessions.has(input.sessionId)) {
                            await syncSnapshotSafely(
                                input.syncSessionMessages,
                                input.chatKey,
                                input.sessionId,
                            )
                            settledSnapshotSessions.add(input.sessionId)
                        }

                        if ((status?.type === 'idle' || status?.type === 'error') || !hasOptimisticLoading(input.get, input.sessionId)) {
                            logChatDebug('session-supervisor', 'stop session supervision: settled', {
                                chatKey: input.chatKey,
                                sessionId: input.sessionId,
                                attempt,
                                status: status?.type || null,
                            })
                            return
                        }
                    } catch (error) {
                        logChatDebug('session-supervisor', 'supervision poll failed', {
                            chatKey: input.chatKey,
                            sessionId: input.sessionId,
                            attempt,
                            error: error instanceof Error ? error.message : String(error),
                        })
                    }

                    await sleep(SESSION_SUPERVISION_POLL_MS)
                }

                logChatDebug('session-supervisor', 'session supervision exhausted', {
                    chatKey: input.chatKey,
                    sessionId: input.sessionId,
                })
            } finally {
                input.onComplete()
            }
        })()

        return () => {
            cancelled = true
        }
    })
}
