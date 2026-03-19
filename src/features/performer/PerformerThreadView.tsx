import { Sparkles } from 'lucide-react'
import type { RefObject } from 'react'
import type { ChatMessage } from '../../types'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import MessageActionBar from '../chat/MessageActionBar'
import { shouldShowChatLoading } from './agent-frame-utils'

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
    return (
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
                    <div key={msg.id} className={`thread-msg thread-msg--${msg.role}`}>
                        {msg.role === 'user' ? (
                            <div className="user-input-box">
                                <span className="user-input-text">{msg.content}</span>
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
                <div className="thread-msg thread-msg--assistant">
                    <div className="assistant-body">
                        <div className="loading-dots">
                            <span /><span /><span />
                        </div>
                    </div>
                </div>
            )}
            endRef={chatEndRef}
            composer={composer}
        />
    )
}
