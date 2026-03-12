import type { ReactNode, RefObject } from 'react'

type ThreadMessage = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
}

type ThreadBodyProps<TMessage extends ThreadMessage> = {
    messages: TMessage[]
    loading: boolean
    renderMessage: (message: TMessage) => ReactNode
    renderEmpty?: () => ReactNode
    renderLoading?: () => ReactNode
    composer: ReactNode
    endRef?: RefObject<HTMLDivElement | null>
    historyRef?: RefObject<HTMLDivElement | null>
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
    historyRef,
    onHistoryScroll,
    historyClassName = 'figma-chat-history',
}: ThreadBodyProps<TMessage>) {
    return (
        <>
            <div ref={historyRef} className={historyClassName} onScroll={onHistoryScroll}>
                {messages.length === 0 ? (
                    renderEmpty ? renderEmpty() : null
                ) : (
                    messages.map((message) => renderMessage(message))
                )}
                {loading && renderLoading ? renderLoading() : null}
                {endRef ? <div ref={endRef} /> : null}
            </div>
            {composer}
        </>
    )
}
