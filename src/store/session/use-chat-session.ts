import { useMemo } from 'react'
import { useStudioStore } from '..'
import {
    deriveChatSessionState,
    IDLE_STATUS,
} from './chat-session-state'
import type { ChatMessage } from '../../types'
import type { Todo } from '@opencode-ai/sdk/v2'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TODOS: Todo[] = []

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

    return useMemo(() => deriveChatSessionState({
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
    }), [
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
