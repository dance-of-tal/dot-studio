import { useState, useMemo, useCallback } from 'react'
import { Paperclip, Sparkles, GitCompare } from 'lucide-react'
import type { RefObject } from 'react'
import type { ChatMessage } from '../../types'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent, {
    hasVisibleAssistantMessageContent,
} from '../chat/ChatMessageContent'
import { hasVisibleUserMessageContent } from '../chat/chat-message-visibility'
import MessageActionBar from '../chat/MessageActionBar'
import { SessionRevertDock } from '../../components/chat/SessionRevertDock'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { TodoDock } from '../../components/chat/TodoDock'
import { SessionReview, collectSessionDiffs } from '../chat/SessionReview'
import { shouldShowChatLoading } from './agent-frame-utils'
import { useStudioStore } from '../../store'
import { selectPendingPermission, selectSessionIdForChatKey, selectTodos } from '../../store/session'

const EMPTY_TODOS: never[] = []

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
    const sessionId = useStudioStore((state) => selectSessionIdForChatKey(state, performerId))
    const todos = useStudioStore((state) => (
        sessionId ? selectTodos(state, sessionId) : EMPTY_TODOS
    ))
    const revertState = useStudioStore((state) => (
        sessionId ? state.sessionReverts[sessionId] || null : null
    ))
    const pendingPermission = useStudioStore((state) => (
        sessionId ? !!selectPendingPermission(state, sessionId) : false
    ))
    const restoreRevertedMessage = useStudioStore((state) => state.restoreRevertedMessage)
    const [showReview, setShowReview] = useState(false)

    const visibleMessages = useMemo(() => {
        if (!revertState?.messageId) {
            return messages
        }
        return messages.filter((message) => message.id < revertState.messageId)
    }, [messages, revertState?.messageId])

    const rolledMessages = useMemo(() => {
        if (!revertState?.messageId) {
            return []
        }
        return messages
            .filter((message) => message.role === 'user' && message.id >= revertState.messageId)
            .map((message) => ({
                id: message.id,
                text: summarizeUserMessage(message),
            }))
    }, [messages, revertState?.messageId])

    const hasDiffs = useMemo(() => collectSessionDiffs(visibleMessages).length > 0, [visibleMessages])

    // TodoDock lifecycle: live when loading or blocked on permission
    const isTodoLive = isLoading || pendingPermission

    const handleTodoClear = useCallback(() => {
        useStudioStore.setState((state) => {
            const next = { ...state.todos }
            const nextEntity = { ...state.seTodos }
            delete next[performerId]
            const resolvedSessionId = selectSessionIdForChatKey(state, performerId)
            if (resolvedSessionId) {
                delete next[resolvedSessionId]
                delete nextEntity[resolvedSessionId]
            }
            return {
                todos: next,
                seTodos: nextEntity,
            }
        })
    }, [performerId])

    const composerWithDock = (
        <>
            <SessionRevertDock
                items={rolledMessages}
                disabled={isLoading}
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
                loading={shouldShowChatLoading(visibleMessages, isLoading)}
                renderEmpty={() => (
                    <div className="chat-empty-state">
                        <Sparkles size={28} className="empty-icon" />
                        <p className="empty-title">Start a conversation</p>
                        <p className="empty-subtitle">Send a message to begin</p>
                    </div>
                )}
                renderMessage={(msg, index) => {
                    const isCurrentSession = index >= prefixCount
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
                                <ChatMessageContent message={msg} />
                            )}
                            {msg.role === 'user' && isCurrentSession ? (
                                <MessageActionBar
                                    message={msg}
                                    performerId={performerId}
                                    canRevert={hasActiveSession}
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
