import { buildActParticipantChatKey, parseActParticipantChatKey } from '../../../shared/chat-targets'
import { api } from '../../api'
import { showToast } from '../../lib/toast'
import type { AssetRef, PerformerNode } from '../../types'
import type { StudioState } from '../types'
import { clearChatSessionView } from './session-commands'
import { releaseSessionRuntimeActor } from './session-runtime-manager'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export type SessionCleanupTarget = {
    chatKey: string
    sessionId: string
}

function uniqueTargets(targets: SessionCleanupTarget[]) {
    const seen = new Set<string>()
    return targets.filter((target) => {
        const key = `${target.chatKey}:${target.sessionId}`
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

function targetFromChatKey(state: Pick<StudioState, 'chatKeyToSession'>, chatKey: string): SessionCleanupTarget | null {
    const sessionId = state.chatKeyToSession[chatKey]
    return sessionId ? { chatKey, sessionId } : null
}

function targetFromSession(
    state: Pick<StudioState, 'chatKeyToSession'>,
    chatKey: string,
    sessionId: string | null | undefined,
): SessionCleanupTarget | null {
    return targetFromChatKey(state, chatKey) || (sessionId ? { chatKey, sessionId } : null)
}

function performerActRef(performer: Pick<PerformerNode, 'id' | 'meta'>): AssetRef {
    const derivedFrom = performer.meta?.derivedFrom?.trim()
    if (!derivedFrom) {
        return { kind: 'draft', draftId: performer.id }
    }
    if (derivedFrom.startsWith('draft:')) {
        return { kind: 'draft', draftId: derivedFrom.slice('draft:'.length) }
    }
    return { kind: 'registry', urn: derivedFrom }
}

function sameAssetRef(left: AssetRef, right: AssetRef) {
    return (left.kind === 'draft' && right.kind === 'draft' && left.draftId === right.draftId)
        || (left.kind === 'registry' && right.kind === 'registry' && left.urn === right.urn)
}

export function collectActSessionTargets(
    state: Pick<StudioState, 'actThreads' | 'chatKeyToSession'>,
    actId: string,
): SessionCleanupTarget[] {
    const targets = Object.entries(state.chatKeyToSession)
        .filter(([chatKey]) => parseActParticipantChatKey(chatKey)?.actId === actId)
        .map(([chatKey, sessionId]) => ({ chatKey, sessionId }))

    for (const thread of state.actThreads[actId] || []) {
        for (const [participantKey, sessionId] of Object.entries(thread.participantSessions || {})) {
            const chatKey = buildActParticipantChatKey(actId, thread.id, participantKey)
            const target = targetFromSession(state, chatKey, sessionId)
            if (target) {
                targets.push(target)
            }
        }
    }

    return uniqueTargets(targets)
}

export function collectActThreadSessionTargets(
    state: Pick<StudioState, 'actThreads' | 'chatKeyToSession'>,
    actId: string,
    threadId: string,
): SessionCleanupTarget[] {
    const targets = Object.entries(state.chatKeyToSession)
        .filter(([chatKey]) => {
            const parsed = parseActParticipantChatKey(chatKey)
            return parsed?.actId === actId && parsed.threadId === threadId
        })
        .map(([chatKey, sessionId]) => ({ chatKey, sessionId }))

    const thread = (state.actThreads[actId] || []).find((entry) => entry.id === threadId)
    if (thread) {
        for (const [participantKey, sessionId] of Object.entries(thread.participantSessions || {})) {
            const chatKey = buildActParticipantChatKey(actId, threadId, participantKey)
            const target = targetFromSession(state, chatKey, sessionId)
            if (target) {
                targets.push(target)
            }
        }
    }

    return uniqueTargets(targets)
}

export function collectPerformerSessionTargets(
    state: Pick<StudioState, 'acts' | 'actThreads' | 'chatKeyToSession'>,
    performer: Pick<PerformerNode, 'id' | 'meta'>,
): SessionCleanupTarget[] {
    const targets: SessionCleanupTarget[] = []
    const direct = targetFromChatKey(state, performer.id)
    if (direct) {
        targets.push(direct)
    }

    const ref = performerActRef(performer)
    for (const act of state.acts) {
        const participantKeys = Object.entries(act.participants || {})
            .filter(([, binding]) => sameAssetRef(binding.performerRef, ref))
            .map(([participantKey]) => participantKey)
        if (participantKeys.length === 0) {
            continue
        }
        const participantKeySet = new Set(participantKeys)
        for (const thread of state.actThreads[act.id] || []) {
            for (const participantKey of participantKeySet) {
                const target = targetFromSession(
                    state,
                    buildActParticipantChatKey(act.id, thread.id, participantKey),
                    thread.participantSessions?.[participantKey],
                )
                if (target) {
                    targets.push(target)
                }
            }
        }
        for (const [chatKey, sessionId] of Object.entries(state.chatKeyToSession)) {
            const parsed = parseActParticipantChatKey(chatKey)
            if (parsed?.actId === act.id && participantKeySet.has(parsed.participantKey)) {
                targets.push({ chatKey, sessionId })
            }
        }
    }

    return uniqueTargets(targets)
}

export function detachSessionTargets(
    set: SetState,
    get: GetState,
    targets: SessionCleanupTarget[],
) {
    if (targets.length === 0) {
        return
    }

    const sessionIds = new Set(targets.map((target) => target.sessionId))
    for (const target of targets) {
        releaseSessionRuntimeActor(set, get, target)
        clearChatSessionView(get, target.chatKey)
        get().removeSession(target.sessionId)
    }

    set((state) => ({
        selectedPerformerSessionId: state.selectedPerformerSessionId && sessionIds.has(state.selectedPerformerSessionId)
            ? null
            : state.selectedPerformerSessionId,
        sessions: state.sessions.filter((session) => !sessionIds.has(session.id)),
    }))
}

export function deleteSessionTargetsRemotely(
    targets: SessionCleanupTarget[],
    options?: {
        title?: string
        dedupeKey?: string
    },
) {
    const sessionIds = Array.from(new Set(targets.map((target) => target.sessionId)))
    if (sessionIds.length === 0) {
        return
    }

    void Promise.all(sessionIds.map(async (sessionId) => {
        try {
            await api.chat.deleteSession(sessionId)
        } catch (error) {
            if (typeof (error as { status?: unknown })?.status === 'number' && (error as { status: number }).status === 404) {
                return
            }
            console.error('Failed to delete session during lifecycle cleanup', { sessionId, error })
            throw error
        }
    })).catch(() => {
        showToast('Studio could not delete every linked thread for this item.', 'error', {
            title: options?.title || 'Thread cleanup failed',
            dedupeKey: options?.dedupeKey || `thread:lifecycle-cleanup:${sessionIds.join(',')}`,
        })
    })
}
