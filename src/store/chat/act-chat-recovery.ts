import { api } from '../../api'
import {
    buildActParticipantChatKey,
    parseActParticipantChatKey,
} from '../../../shared/chat-targets'
import { logChatDebug } from '../../lib/chat-debug'
import { syncSessionSnapshot } from '../session'
import { resolveSessionActivity } from '../session/session-activity'
import type { ChatGet, ChatSet } from './chat-internals'

export const ACT_THREAD_RECOVERY_MAX_POLLS = 120
export const ACT_THREAD_RECOVERY_TAIL_MS = 10_000

type ActTarget = NonNullable<ReturnType<typeof parseActParticipantChatKey>>

type ParticipantRecoveryStatus = Awaited<ReturnType<typeof api.chat.status>>['status']

type ActParticipantSession = {
    participantKey: string
    chatKey: string
    sessionId: string
}

export type ActRecoveryState = {
    lastThreadSignature: string | null
    stableThreadPolls: number
    lastThreadActivityAt: number | null
}

type SyncActRecoveryParticipantsParams = {
    set: ChatSet
    get: ChatGet
    chatKey: string
    sessionId: string
    actTarget: ActTarget
    attempt: number
    state: ActRecoveryState
}

type SyncActRecoveryParticipantsResult = {
    state: ActRecoveryState
    primaryStatus: ParticipantRecoveryStatus | undefined
    hasActiveSessions: boolean
}

export function createInitialActRecoveryState(enabled: boolean): ActRecoveryState {
    return {
        lastThreadSignature: null,
        stableThreadPolls: 0,
        lastThreadActivityAt: enabled ? Date.now() : null,
    }
}

export function isActRecoverySettled(
    actTarget: ActTarget | null,
    state: ActRecoveryState,
    hasActiveSessions: boolean,
) {
    if (!actTarget) {
        return true
    }

    return !hasActiveSessions
        && state.stableThreadPolls >= 2
        && !!state.lastThreadActivityAt
        && (Date.now() - state.lastThreadActivityAt) >= ACT_THREAD_RECOVERY_TAIL_MS
}

export async function syncActRecoveryParticipants({
    set,
    get,
    chatKey,
    sessionId,
    actTarget,
    attempt,
    state,
}: SyncActRecoveryParticipantsParams): Promise<SyncActRecoveryParticipantsResult> {
    await get().loadThreads(actTarget.actId).catch((error) => {
        logChatDebug('fallback', 'thread sync failed during act recovery polling', {
            chatKey,
            sessionId,
            actId: actTarget.actId,
            threadId: actTarget.threadId,
            attempt,
            error: error instanceof Error ? error.message : String(error),
        })
    })

    const currentState = get()
    const participants = listActThreadParticipantSessions(currentState, actTarget.actId, actTarget.threadId)
    const threadSignature = buildActThreadParticipantSignature(currentState, actTarget.actId, actTarget.threadId)
    const signatureChanged = threadSignature !== state.lastThreadSignature
    const nextState: ActRecoveryState = {
        lastThreadSignature: threadSignature,
        stableThreadPolls: threadSignature === state.lastThreadSignature
            ? state.stableThreadPolls + 1
            : 0,
        lastThreadActivityAt: state.lastThreadActivityAt,
    }

    const participantStatuses = await Promise.all(participants.map(async (participant) => {
        try {
            const result = await api.chat.status(participant.sessionId)
            return { ...participant, status: result.status }
        } catch (error) {
            logChatDebug('fallback', 'participant status sync failed during act recovery polling', {
                chatKey,
                sessionId,
                participantChatKey: participant.chatKey,
                participantSessionId: participant.sessionId,
                attempt,
                error: error instanceof Error ? error.message : String(error),
            })
            return { ...participant, status: null }
        }
    }))

    let hasActiveSessions = false
    for (const participant of participantStatuses) {
        if (participant.status) {
            get().setSessionStatus(participant.sessionId, participant.status)
            get().setSessionLoading(participant.sessionId, false)
        }

        const isParticipantActive = participant.status?.type === 'busy' || participant.status?.type === 'retry'
        if (isParticipantActive) {
            hasActiveSessions = true

            if (participant.sessionId !== sessionId) {
                await syncSessionSnapshot(set, get, participant.chatKey, participant.sessionId).catch(() => null)
            }
            continue
        }

        if (participant.status?.type === 'idle' || participant.status?.type === 'error') {
            get().setSessionLoading(participant.sessionId, false)
            continue
        }

        const activity = resolveSessionActivity({
            loading: !!get().sessionLoading[participant.sessionId],
            status: get().seStatuses[participant.sessionId],
            messages: get().seMessages[participant.sessionId] || [],
            permission: get().sePermissions[participant.sessionId] || null,
            question: get().seQuestions[participant.sessionId] || null,
        })

        if (activity.isActive) {
            hasActiveSessions = true
        }
    }

    if (hasActiveSessions || signatureChanged) {
        nextState.lastThreadActivityAt = Date.now()
    }

    return {
        state: nextState,
        primaryStatus: participantStatuses.find((participant) => participant.sessionId === sessionId)?.status,
        hasActiveSessions,
    }
}

function listActThreadParticipantSessions(state: ReturnType<ChatGet>, actId: string, threadId: string): ActParticipantSession[] {
    const thread = (state.actThreads?.[actId] || []).find((entry) => entry.id === threadId)
    if (!thread) {
        return []
    }

    return Object.entries(thread.participantSessions || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .filter(([, sessionId]) => !!sessionId)
        .map(([participantKey, sessionId]) => ({
            participantKey,
            chatKey: buildActParticipantChatKey(actId, threadId, participantKey),
            sessionId,
        }))
}

function buildActThreadParticipantSignature(state: ReturnType<ChatGet>, actId: string, threadId: string) {
    const participants = listActThreadParticipantSessions(state, actId, threadId)
    if (!participants.length) {
        return 'missing'
    }

    return participants
        .map(({ participantKey, sessionId }) => `${participantKey}:${sessionId}`)
        .join('|')
}
