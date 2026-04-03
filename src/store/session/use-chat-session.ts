import { useMemo } from 'react'
import { useStudioStore } from '..'
import { mergeSystemPrefixMessages } from '../../lib/chat-messages'
import type { ChatMessage } from '../../types'
import type { SessionStatus } from './types'
import type { Todo } from '@opencode-ai/sdk/v2'
import { resolveSessionActivity } from './session-activity'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TODOS: Todo[] = []
const IDLE_STATUS: SessionStatus = { type: 'idle' }
const EMPTY_CHAT_SESSION = {
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
} as const

export function useChatSession(chatKey: string | null) {
    const sessionId = useStudioStore((state) => (
        chatKey ? state.chatKeyToSession[chatKey] || null : null
    ))
    const draftMessages = useStudioStore((state) => (
        chatKey ? state.chatDrafts[chatKey] || EMPTY_MESSAGES : EMPTY_MESSAGES
    ))
    const prefixMessages = useStudioStore((state) => (
        chatKey ? state.chatPrefixes[chatKey] || EMPTY_MESSAGES : EMPTY_MESSAGES
    ))
    const sessionMessages = useStudioStore((state) => (
        sessionId ? state.seMessages[sessionId] || EMPTY_MESSAGES : EMPTY_MESSAGES
    ))
    const rawLoading = useStudioStore((state) => (
        sessionId ? !!state.sessionLoading[sessionId] : false
    ))
    const rawStatus = useStudioStore((state) => (
        sessionId ? state.seStatuses[sessionId] : null
    ))
    const status = useStudioStore((state) => (
        sessionId ? state.seStatuses[sessionId] || IDLE_STATUS : IDLE_STATUS
    ))
    const permission = useStudioStore((state) => (
        sessionId ? state.sePermissions[sessionId] || null : null
    ))
    const question = useStudioStore((state) => (
        sessionId ? state.seQuestions[sessionId] || null : null
    ))
    const todos = useStudioStore((state) => (
        sessionId ? state.seTodos[sessionId] || EMPTY_TODOS : EMPTY_TODOS
    ))
    const revert = useStudioStore((state) => (
        sessionId ? state.sessionReverts[sessionId] || null : null
    ))
    const isMutating = useStudioStore((state) => (
        sessionId ? !!state.sessionMutationPending[sessionId] : false
    ))

    return useMemo(() => {
        if (!chatKey) {
            return EMPTY_CHAT_SESSION
        }

        const messages = sessionId
            ? mergeSystemPrefixMessages(prefixMessages, sessionMessages)
            : draftMessages
        const prefixCount = !sessionId
            ? draftMessages.length
            : prefixMessages.filter((prefix) => (
                prefix.role === 'system'
                && !sessionMessages.some((message) => message.id === prefix.id)
            )).length
        const activity = resolveSessionActivity({
            loading: rawLoading,
            status: rawStatus,
            messages,
            permission,
            question,
        })
        const isLoading = activity.isActive

        return {
            chatKey,
            sessionId,
            messages,
            prefixCount,
            isLoading,
            canAbort: activity.canAbort,
            isMutating,
            activityKind: activity.kind,
            status,
            permission,
            question,
            todos,
            revert,
        }
    }, [
        chatKey,
        sessionId,
        draftMessages,
        prefixMessages,
        sessionMessages,
        rawLoading,
        rawStatus,
        status,
        permission,
        question,
        todos,
        revert,
        isMutating,
    ])
}
