import { useState, useMemo, useCallback } from 'react'
import { Paperclip, Sparkles, GitCompare } from 'lucide-react'
import type { RefObject } from 'react'
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
import { SessionReview, collectSessionDiffs } from '../chat/SessionReview'
import { useStudioStore } from '../../store'
import { useChatSession } from '../../store/session/use-chat-session'

type Props = {
    performerId: string
    messages: ChatMessage[]
    prefixCount: number
    isLoading: boolean
    hasActiveSession: boolean
    chatEndRef: RefObject<HTMLDivElement | null>
    onOpenRevert: (performerId: string, messageId: string, content: string) => void
    composer: React.ReactNode
}

export default function PerformerThreadView({
    performerId,
    messages,
    prefixCount,
    isLoading,
    hasActiveSession,
    chatEndRef,
    onOpenRevert,
    composer,
}: Props) {
    const chatSession = useChatSession(performerId)
    const { sessionId, todos, revert: revertState, permission, isMutating } = chatSession
    const restoreRevertedMessage = useStudioStore((state) => state.restoreRevertedMessage)
    const setSessionTodos = useStudioStore((state) => state.setSessionTodos)
    const [showReview, setShowReview] = useState(false)
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

    const hasDiffs = useMemo(() => collectSessionDiffs(visibleMessages).length > 0, [visibleMessages])

    // TodoDock lifecycle: live when loading or blocked on permission
    const isTodoLive = isLoading || !!permission

    const handleTodoClear = useCallback(() => {
        if (!sessionId) return
        setSessionTodos(sessionId, [])
    }, [sessionId, setSessionTodos])

    const composerWithDock = (
        <>
            <SessionRevertDock
                items={rolledMessages}
                disabled={isLoading || isMutating}
                onRestore={(messageId) => {
                    void restoreRevertedMessage(performerId, messageId)
                }}
            />
            <TodoDock todos={todos} isLive={isTodoLive} onClear={handleTodoClear} />
            {composer}
        </>
    )

    return (
        <>
            {showReview && (
                <SessionReview messages={visibleMessages} className="performer-session-review" />
            )}
            <ThreadBody
                messages={visibleMessages}
                loading={shouldShowAssistantLoadingPlaceholder(visibleMessages, isLoading)}
                renderEmpty={() => (
                    <div className="chat-empty-state">
                        <Sparkles size={28} className="empty-icon" />
                        <p className="empty-title">Start a conversation</p>
                        <p className="empty-subtitle">Send a message to begin</p>
                    </div>
                )}
                renderMessage={(msg, index) => {
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
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                            {msg.attachments.map((att, i) => (
                                                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--bg-hover)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: 'var(--text-secondary)' }}>
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
                }}
                renderLoading={() => (
                    <div className="thread-msg thread-msg--assistant" data-scrollable>
                        <div className="assistant-body">
                            <TextShimmer text="Thinking" active />
                        </div>
                    </div>
                )}
                endRef={chatEndRef}
                composer={composerWithDock}
            />
            {hasDiffs && (
                <button
                    className="session-review-toggle"
                    onClick={() => setShowReview(!showReview)}
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
