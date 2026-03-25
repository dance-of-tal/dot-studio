import { useState, useMemo } from 'react'
import { Paperclip, Sparkles, GitCompare } from 'lucide-react'
import type { RefObject } from 'react'
import type { ChatMessage } from '../../types'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import MessageActionBar from '../chat/MessageActionBar'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { TodoDock } from '../../components/chat/TodoDock'
import { SessionReview, collectSessionDiffs } from '../chat/SessionReview'
import { shouldShowChatLoading } from './agent-frame-utils'
import { useStudioStore } from '../../store'

const EMPTY_TODOS: never[] = []

type Props = {
    performerId: string
    messages: ChatMessage[]
    prefixCount: number
    isLoading: boolean
    hasActiveSession: boolean
    canUndoLastTurn: boolean
    lastMessageId: string | null
    chatEndRef: RefObject<HTMLDivElement | null>
    undoLastTurn: (performerId: string) => Promise<void>
    onOpenRevert: (performerId: string, messageId: string, content: string) => void
    composer: React.ReactNode
}

export default function PerformerThreadView({
    performerId,
    messages,
    prefixCount,
    isLoading,
    hasActiveSession,
    canUndoLastTurn,
    lastMessageId,
    chatEndRef,
    undoLastTurn,
    onOpenRevert,
    composer,
}: Props) {
    const todos = useStudioStore((s) => s.todos[performerId]) ?? EMPTY_TODOS
    const [showReview, setShowReview] = useState(false)
    const hasDiffs = useMemo(() => collectSessionDiffs(messages).length > 0, [messages])

    const composerWithDock = (
        <>
            <TodoDock todos={todos} />
            {composer}
        </>
    )

    return (
        <>
            {showReview && (
                <SessionReview messages={messages} className="performer-session-review" />
            )}
            <ThreadBody
                messages={messages}
                loading={shouldShowChatLoading(messages, isLoading)}
                renderEmpty={() => (
                    <div className="chat-empty-state">
                        <Sparkles size={28} className="empty-icon" />
                        <p className="empty-title">Start a conversation</p>
                        <p className="empty-subtitle">Send a message to begin</p>
                    </div>
                )}
                renderMessage={(msg, index) => {
                    const isCurrentSession = index >= prefixCount
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
                            {msg.role !== 'system' && isCurrentSession ? (
                                <MessageActionBar
                                    message={msg}
                                    performerId={performerId}
                                    isLastMessage={msg.id === lastMessageId}
                                    canUndo={canUndoLastTurn}
                                    canRevert={hasActiveSession}
                                    isLoading={isLoading}
                                    onUndo={undoLastTurn}
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
