import type { PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2'
import type { PerformerNode, WorkspaceAct } from '../../types'
import { buildActParticipantChatKey } from '../../../shared/chat-targets'
import { resolveActParticipantPerformer as resolveParticipantPerformer } from '../../lib/act-participants'
import type { SessionStatus } from '../../store/session'
import { resolveSessionActivity } from '../../store/session/session-activity'

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
    actId: string
    threadId: string | null
    participantKeys: string[]
    chatKeyToSession: Record<string, string>
    sessionLoading: Record<string, boolean>
    seMessages: Record<string, import('../../types').ChatMessage[]>
    seStatuses: Record<string, SessionStatus>
    sePermissions: Record<string, PermissionRequest>
    seQuestions: Record<string, QuestionRequest>
}) {
    const {
        actId,
        threadId,
        participantKeys,
        chatKeyToSession,
        sessionLoading,
        seMessages,
        seStatuses,
        sePermissions,
        seQuestions,
    } = params
    if (!threadId) {
        return new Map<string, boolean>()
    }

    return new Map(
        participantKeys.map((participantKey) => {
            const participantChatKey = buildActParticipantChatKey(actId, threadId, participantKey)
            const participantSessionId = chatKeyToSession[participantChatKey]
            return [participantKey, participantSessionId ? resolveSessionActivity({
                loading: !!sessionLoading[participantSessionId],
                status: seStatuses[participantSessionId],
                messages: seMessages[participantSessionId] || [],
                permission: sePermissions[participantSessionId] || null,
                question: seQuestions[participantSessionId] || null,
            }).isActive : false]
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
