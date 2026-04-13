import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'
import { mergeSystemPrefixMessages } from '../../lib/chat-messages'
import type { ChatMessage } from '../../types'
import type { SessionStatus } from './types'
import { resolveSessionActivity } from './session-activity'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TODOS: Todo[] = []
export const IDLE_STATUS: SessionStatus = { type: 'idle' }

export type ChatSessionState = {
    chatKey: string | null
    sessionId: string | null
    messages: ChatMessage[]
    prefixCount: number
    isLoading: boolean
    canAbort: boolean
    isMutating: boolean
    activityKind: ReturnType<typeof resolveSessionActivity>['kind']
    status: SessionStatus
    permission: PermissionRequest | null
    question: QuestionRequest | null
    todos: Todo[]
    revert: { messageId: string; partId?: string } | null
}

export const EMPTY_CHAT_SESSION_STATE: ChatSessionState = {
    chatKey: null,
    sessionId: null,
    messages: EMPTY_MESSAGES,
    prefixCount: 0,
    isLoading: false,
    canAbort: false,
    isMutating: false,
    activityKind: 'idle',
    status: IDLE_STATUS,
    permission: null,
    question: null,
    todos: EMPTY_TODOS,
    revert: null,
}

type DeriveChatSessionStateInput = {
    chatKey: string | null
    sessionId: string | null
    draftMessages?: ChatMessage[]
    prefixMessages?: ChatMessage[]
    sessionMessages?: ChatMessage[]
    rawLoading?: boolean
    rawStatus?: SessionStatus | null
    status?: SessionStatus
    permission?: PermissionRequest | null
    question?: QuestionRequest | null
    todos?: Todo[]
    revert?: { messageId: string; partId?: string } | null
    isMutating?: boolean
}

export function deriveChatSessionState(input: DeriveChatSessionStateInput): ChatSessionState {
    if (!input.chatKey) {
        return EMPTY_CHAT_SESSION_STATE
    }

    const draftMessages = input.draftMessages || EMPTY_MESSAGES
    const prefixMessages = input.prefixMessages || EMPTY_MESSAGES
    const sessionMessages = input.sessionMessages || EMPTY_MESSAGES
    const status = input.status || IDLE_STATUS
    const permission = input.permission || null
    const question = input.question || null
    const todos = input.todos || EMPTY_TODOS
    const revert = input.revert || null
    const isMutating = !!input.isMutating
    const messages = input.sessionId
        ? mergeSystemPrefixMessages(prefixMessages, sessionMessages)
        : draftMessages
    const prefixCount = !input.sessionId
        ? draftMessages.length
        : prefixMessages.filter((prefix) => (
            prefix.role === 'system'
            && !sessionMessages.some((message) => message.id === prefix.id)
        )).length
    const activity = resolveSessionActivity({
        loading: !!input.rawLoading,
        status: input.rawStatus || null,
        messages,
        permission,
        question,
    })

    return {
        chatKey: input.chatKey,
        sessionId: input.sessionId,
        messages,
        prefixCount,
        isLoading: activity.isActive,
        canAbort: activity.canAbort,
        isMutating,
        activityKind: activity.kind,
        status,
        permission,
        question,
        todos,
        revert,
    }
}
