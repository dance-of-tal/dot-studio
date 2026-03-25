import type { ReactNode, RefObject } from 'react'
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
}: ThreadBodyProps<TMessage>) {
    const {
        scrollRef,
        contentRef,
        handleScroll,
        userScrolled,
        resume,
    } = useAutoScroll({ working: loading })

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
                    {messages.length === 0 ? (
                        renderEmpty ? renderEmpty() : null
                    ) : (
                        messages.map((message, index) => renderMessage(message, index))
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
