import { useState, useMemo, useCallback, useEffect } from 'react'
import { Paperclip, Sparkles, GitCompare } from 'lucide-react'
import type { ChatMessage } from '../../types'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import {
    hasVisibleAssistantMessageContent,
    hasVisibleUserMessageContent,
    isStreamingAssistantMessage,
    shouldShowAssistantLoadingPlaceholder,
} from '../chat/chat-message-visibility'
import MessageActionBar from '../chat/MessageActionBar'
import { SessionRevertDock } from '../../components/chat/SessionRevertDock'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { TodoDock } from '../../components/chat/TodoDock'
import { SessionReview } from '../chat/SessionReview'
import { collectSessionDiffs, normalizeSessionDiffEntries } from '../chat/session-review-diffs'
import { useStudioStore } from '../../store'
import { useChatSession } from '../../store/session/use-chat-session'

type Props = {
    performerId: string
    messages: ChatMessage[]
    prefixCount: number
    isLoading: boolean
    hasActiveSession: boolean
    onOpenRevert: (performerId: string, messageId: string, content: string) => void
    composer: React.ReactNode
}

export default function PerformerThreadView({
    performerId,
    messages,
    prefixCount,
    isLoading,
    hasActiveSession,
    onOpenRevert,
    composer,
}: Props) {
    const chatSession = useChatSession(performerId)
    const { sessionId, todos, revert: revertState, permission, isMutating } = chatSession
    const restoreRevertedMessage = useStudioStore((state) => state.restoreRevertedMessage)
    const setSessionTodos = useStudioStore((state) => state.setSessionTodos)
    const getDiff = useStudioStore((state) => state.getDiff)
    const [showReview, setShowReview] = useState(false)
    const [sessionDiffState, setSessionDiffState] = useState<{
        sessionId: string
        entries: Array<Record<string, unknown>>
    } | null>(null)
    const revertMessageId = revertState?.messageId ?? null

    const visibleMessages = useMemo(() => {
        if (!revertMessageId) {
            return messages
        }
        return messages.filter((message) => message.id < revertMessageId)
    }, [messages, revertMessageId])

    const rolledMessages = useMemo(() => {
        if (!revertMessageId) {
            return []
        }
        return messages
            .filter((message) => message.role === 'user' && message.id >= revertMessageId)
            .map((message) => ({
                id: message.id,
                text: summarizeUserMessage(message),
            }))
    }, [messages, revertMessageId])

    useEffect(() => {
        if (!sessionId) {
            return
        }

        let active = true
        void getDiff(performerId).then((entries) => {
            if (active) {
                setSessionDiffState({
                    sessionId,
                    entries: entries || [],
                })
            }
        })

        return () => {
            active = false
        }
    }, [getDiff, performerId, sessionId])

    const sessionDiffEntries = sessionDiffState?.sessionId === sessionId
        ? sessionDiffState.entries
        : null

    const sessionDiffs = useMemo(
        () => normalizeSessionDiffEntries(sessionDiffEntries),
        [sessionDiffEntries],
    )
    const fallbackDiffs = useMemo(
        () => collectSessionDiffs(visibleMessages),
        [visibleMessages],
    )
    const hasDiffs = sessionDiffs.length > 0 || fallbackDiffs.length > 0

    // TodoDock lifecycle: live when loading or blocked on permission
    const isTodoLive = isLoading || !!permission

    const handleTodoClear = useCallback(() => {
        if (!sessionId) return
        setSessionTodos(sessionId, [])
    }, [sessionId, setSessionTodos])

    const handleRestoreRevertedMessage = useCallback((messageId: string) => {
        void restoreRevertedMessage(performerId, messageId)
    }, [performerId, restoreRevertedMessage])

    const renderEmpty = useCallback(() => (
        <div className="chat-empty-state">
            <Sparkles size={28} className="empty-icon" />
            <p className="empty-title">Start a conversation</p>
            <p className="empty-subtitle">Send a message to begin</p>
        </div>
    ), [])

    const renderMessage = useCallback((msg: ChatMessage, index: number) => {
        const isCurrentSession = index >= prefixCount
        const isStreamingAssistant = isStreamingAssistantMessage(visibleMessages, index, isLoading)
        if (msg.role === 'user' && !hasVisibleUserMessageContent(msg)) {
            return null
        }
        if (msg.role === 'assistant' && !hasVisibleAssistantMessageContent(msg)) {
            return null
        }
        return (
            <div key={msg.id} className={`thread-msg thread-msg--${msg.role}`} data-scrollable>
                {msg.role === 'user' ? (
                    <div className="user-input-box">
                        <span className="user-input-text">{msg.content}</span>
                        {msg.attachments && msg.attachments.length > 0 ? (
                            <div className="thread-attachment-list">
                                {msg.attachments.map((att, i) => (
                                    <span
                                        key={i}
                                        className="thread-attachment-chip"
                                        title={att.filename || 'file'}
                                    >
                                        <Paperclip size={10} />
                                        {att.filename || 'file'}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <ChatMessageContent message={msg} streaming={isStreamingAssistant} />
                )}
                {msg.role === 'user' && isCurrentSession ? (
                    <MessageActionBar
                        message={msg}
                        performerId={performerId}
                        canRevert={hasActiveSession && !isMutating}
                        onRevert={(pid, mid) => onOpenRevert(pid, mid, msg.content)}
                    />
                ) : null}
            </div>
        )
    }, [hasActiveSession, isLoading, isMutating, onOpenRevert, performerId, prefixCount, visibleMessages])

    const renderLoading = useCallback(() => (
        <div className="thread-msg thread-msg--assistant" data-scrollable>
            <div className="assistant-body">
                <TextShimmer text="Thinking" active />
            </div>
        </div>
    ), [])

    const composerWithDock = useMemo(() => (
        <>
            <SessionRevertDock
                items={rolledMessages}
                disabled={isLoading || isMutating}
                onRestore={handleRestoreRevertedMessage}
            />
            <TodoDock todos={todos} isLive={isTodoLive} onClear={handleTodoClear} />
            {composer}
        </>
    ), [composer, handleRestoreRevertedMessage, handleTodoClear, isLoading, isMutating, isTodoLive, rolledMessages, todos])

    const handleToggleReview = useCallback(() => {
        setShowReview((current) => !current)
    }, [])

    return (
        <>
            {showReview && (
                <SessionReview
                    messages={visibleMessages}
                    diffEntries={sessionDiffEntries}
                    className="performer-session-review"
                />
            )}
            <ThreadBody
                messages={visibleMessages}
                loading={shouldShowAssistantLoadingPlaceholder(visibleMessages, isLoading)}
                scrollStateKey={performerId}
                scrollRestoreMode="bottom"
                renderEmpty={renderEmpty}
                renderMessage={renderMessage}
                renderLoading={renderLoading}
                composer={composerWithDock}
            />
            {hasDiffs && (
                <button
                    className="session-review-toggle"
                    onClick={handleToggleReview}
                    title={showReview ? 'Hide changes' : 'Review changes'}
                    type="button"
                >
                    <GitCompare size={14} />
                </button>
            )}
        </>
    )
}

function summarizeUserMessage(message: ChatMessage): string {
    const text = (message.content || '').replace(/\s+/g, ' ').trim()
    if (text) {
        return text
    }
    if (message.attachments?.length) {
        return message.attachments.length === 1 ? '[attachment]' : `[${message.attachments.length} attachments]`
    }
    return '[message]'
}
