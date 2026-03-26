import { useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { ScrollToBottom } from '../../components/chat/ScrollToBottom'

type ThreadMessage = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
}

type ThreadBodyProps<TMessage extends ThreadMessage> = {
    messages: TMessage[]
    loading: boolean
    renderMessage: (message: TMessage, index: number) => ReactNode
    renderEmpty?: () => ReactNode
    renderLoading?: () => ReactNode
    composer: ReactNode
    endRef?: RefObject<HTMLDivElement | null>
    historyRef?: RefObject<HTMLDivElement | null>
    /** @deprecated Use useAutoScroll instead */
    onHistoryScroll?: () => void
    historyClassName?: string
    recentMessageWindow?: number
    olderMessagesStep?: number
}

export default function ThreadBody<TMessage extends ThreadMessage>({
    messages,
    loading,
    renderMessage,
    renderEmpty,
    renderLoading,
    composer,
    endRef,
    historyClassName = 'chat-history',
    recentMessageWindow = 120,
    olderMessagesStep = 120,
}: ThreadBodyProps<TMessage>) {
    const {
        scrollRef,
        contentRef,
        handleScroll,
        userScrolled,
        resume,
    } = useAutoScroll({ working: loading })
    const [visibleCount, setVisibleCount] = useState(recentMessageWindow)
    const effectiveVisibleCount = Math.max(visibleCount, recentMessageWindow)
    const hiddenCount = Math.max(0, messages.length - effectiveVisibleCount)
    const visibleMessages = useMemo(
        () => (hiddenCount > 0 ? messages.slice(-effectiveVisibleCount) : messages),
        [messages, hiddenCount, effectiveVisibleCount],
    )

    return (
        <>
            <div
                ref={(el) => {
                    scrollRef(el)
                }}
                className={historyClassName}
                onScroll={handleScroll}
                style={{ position: 'relative' }}
            >
                <div ref={(el) => { contentRef(el) }}>
                    {hiddenCount > 0 ? (
                        <div className="thread-history-older">
                            <button
                                className="thread-history-older__button"
                                onClick={() => setVisibleCount((count) => count + olderMessagesStep)}
                                type="button"
                            >
                                Show {Math.min(hiddenCount, olderMessagesStep)} older messages
                            </button>
                        </div>
                    ) : null}
                    {messages.length === 0 ? (
                        renderEmpty ? renderEmpty() : null
                    ) : (
                        visibleMessages.map((message, index) => renderMessage(
                            message,
                            hiddenCount + index,
                        ))
                    )}
                    {loading && renderLoading ? renderLoading() : null}
                    {endRef ? <div ref={endRef} /> : null}
                </div>
                <ScrollToBottom
                    visible={userScrolled && messages.length > 0}
                    onClick={resume}
                />
            </div>
            {composer}
        </>
    )
}
