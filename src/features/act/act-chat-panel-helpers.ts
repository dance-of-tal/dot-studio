import type { PerformerNode, WorkspaceAct } from '../../types'
import { buildActParticipantChatKey } from '../../../shared/chat-targets'
import { resolveActParticipantPerformer as resolveParticipantPerformer } from '../../lib/act-participants'
import type { ActThreadState } from '../../store/types'

export function resolveActiveActParticipantKey(
    participantKeys: string[],
    currentThreadId: string | null,
    activeThreadParticipantKey: string | null,
) {
    const isCallboardView = !!currentThreadId && activeThreadParticipantKey === null
    const activeParticipantKey = isCallboardView ? null : activeThreadParticipantKey || participantKeys[0] || null

    return {
        isCallboardView,
        activeParticipantKey,
    }
}

export function buildActiveActParticipantChatKey(
    actId: string,
    threadId: string | null,
    participantKey: string | null,
) {
    if (!threadId || !participantKey) {
        return null
    }

    return buildActParticipantChatKey(actId, threadId, participantKey)
}

export function buildActParticipantLoadingStates(params: {
    currentThread: ActThreadState | null
    participantKeys: string[]
}) {
    const {
        currentThread,
        participantKeys,
    } = params
    if (!currentThread) {
        return new Map<string, boolean>()
    }

    return new Map(
        participantKeys.map((participantKey) => {
            const status = currentThread.participantStatuses?.[participantKey]?.type
            return [participantKey, status === 'busy' || status === 'retry']
        }),
    )
}

export function resolveActParticipantPerformer(
    act: WorkspaceAct | null | undefined,
    participantKey: string | null,
    performers: PerformerNode[],
) {
    return resolveParticipantPerformer(act, participantKey, performers)
}
