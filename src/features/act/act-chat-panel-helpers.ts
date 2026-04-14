import type { PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2'
import type { PerformerNode, WorkspaceAct } from '../../types'
import { buildActParticipantChatKey } from '../../../shared/chat-targets'
import { resolveActParticipantPerformer as resolveParticipantPerformer } from '../../lib/act-participants'
import type { ActThreadState } from '../../store/types'
import type { ChatMessage } from '../../types'
import { resolveSessionActivity } from '../../store/session/session-activity'
import type { SessionStatus } from '../../store/session/types'

type ParticipantExecutionState = {
    loading: boolean
    status: SessionStatus | null | undefined
    messages: ChatMessage[]
    permission?: PermissionRequest | null
    question?: QuestionRequest | null
}

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
    executionStatesByParticipant?: Record<string, ParticipantExecutionState | null | undefined>
}) {
    const {
        currentThread,
        participantKeys,
        executionStatesByParticipant,
    } = params
    if (!currentThread) {
        return new Map<string, boolean>()
    }

    return new Map(
        participantKeys.map((participantKey) => {
            const executionState = executionStatesByParticipant?.[participantKey]
            if (executionState) {
                return [participantKey, resolveSessionActivity(executionState).isActive]
            }

            const status = currentThread.participantStatuses?.[participantKey]?.type
            return [participantKey, status === 'busy']
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
