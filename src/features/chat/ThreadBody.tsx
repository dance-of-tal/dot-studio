import { memo, useMemo, useState, type ReactNode } from 'react'
import { useAutoScroll } from '../../hooks/useAutoScroll'

type ThreadMessage = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
}

type ThreadBodyProps<TMessage extends ThreadMessage> = {
    messages: TMessage[]
    loading: boolean
    scrollStateKey?: string | null
    renderMessage: (message: TMessage, index: number) => ReactNode
    renderEmpty?: () => ReactNode
    renderLoading?: () => ReactNode
    composer: ReactNode
    historyClassName?: string
    recentMessageWindow?: number
    olderMessagesStep?: number
}

type ThreadHistoryProps<TMessage extends ThreadMessage> = Omit<ThreadBodyProps<TMessage>, 'composer'>

function ThreadHistoryInner<TMessage extends ThreadMessage>({
    messages,
    loading,
    scrollStateKey,
    renderMessage,
    renderEmpty,
    renderLoading,
    historyClassName = 'chat-history',
    recentMessageWindow = 120,
    olderMessagesStep = 120,
}: ThreadHistoryProps<TMessage>) {
    const {
        scrollRef,
        contentRef,
        handleScroll,
    } = useAutoScroll({
        stateKey: scrollStateKey,
        contentVersion: messages,
    })
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
                </div>
            </div>
        </>
    )
}

const ThreadHistory = memo(
    ThreadHistoryInner,
    <TMessage extends ThreadMessage>(
        prev: ThreadHistoryProps<TMessage>,
        next: ThreadHistoryProps<TMessage>,
    ) => (
        prev.messages === next.messages
        && prev.loading === next.loading
        && prev.scrollStateKey === next.scrollStateKey
        && prev.renderMessage === next.renderMessage
        && prev.renderEmpty === next.renderEmpty
        && prev.renderLoading === next.renderLoading
        && prev.historyClassName === next.historyClassName
        && prev.recentMessageWindow === next.recentMessageWindow
        && prev.olderMessagesStep === next.olderMessagesStep
    ),
) as typeof ThreadHistoryInner

export default function ThreadBody<TMessage extends ThreadMessage>({
    composer,
    ...historyProps
}: ThreadBodyProps<TMessage>) {
    return (
        <>
            <ThreadHistory {...historyProps} />
            {composer}
        </>
    )
}
