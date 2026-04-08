import { memo, useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import type { ChatMessage, ChatMessagePart, ChatMessageToolInfo } from '../../types'
import { stripAssistantActionBlock } from '../assistant/assistant-protocol'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { ToolGroup } from './ToolGroup'
import { useUISettings } from '../../store/settingsSlice'

function stripMarkdownMarkers(text: string) {
    return text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/#+\s*/g, '')
        .replace(/`/g, '')
        .replace(/\n+/g, ' ')
        .trim()
}

function getThinkingText(text: string) {
    return stripMarkdownMarkers(text)
}

function ReasoningBlock({ content, streaming = false }: { content: string; streaming?: boolean }) {
    const [expanded, setExpanded] = useState(streaming)
    const thinkingText = getThinkingText(content)
    const preview = thinkingText.slice(0, 200)

    useEffect(() => {
        setExpanded(streaming)
    }, [streaming])

    const handleToggle = useCallback(() => {
        if (streaming) return
        setExpanded((current) => !current)
    }, [streaming])

    return (
        <div className="thinking-row">
            <button className="thinking-row__header" onClick={handleToggle} type="button">
                <span className="thinking-row__chevron">
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
                <span className="thinking-row__label">
                    <TextShimmer text="Thinking" active={streaming} />
                </span>
                {(expanded ? thinkingText : preview) ? (
                    <span className={`thinking-row__preview${expanded ? ' thinking-row__preview--expanded' : ''}`}>
                        {expanded ? thinkingText : preview}
                        {!expanded && thinkingText.length > 200 ? '…' : ''}
                    </span>
                ) : null}
            </button>
        </div>
    )
}

/**
 * Group consecutive tool parts together for compact display.
 * Non-tool parts remain as individual items.
 */
function groupParts(parts: ChatMessagePart[]): Array<{ kind: 'tool-group'; tools: ChatMessageToolInfo[] } | { kind: 'part'; part: ChatMessagePart }> {
    const groups: Array<{ kind: 'tool-group'; tools: ChatMessageToolInfo[] } | { kind: 'part'; part: ChatMessagePart }> = []
    let currentToolGroup: ChatMessageToolInfo[] = []

    for (const part of parts) {
        if (part.type === 'tool' && part.tool) {
            currentToolGroup.push(part.tool)
        } else {
            if (currentToolGroup.length > 0) {
                groups.push({ kind: 'tool-group', tools: [...currentToolGroup] })
                currentToolGroup = []
            }
            groups.push({ kind: 'part', part })
        }
    }
    if (currentToolGroup.length > 0) {
        groups.push({ kind: 'tool-group', tools: currentToolGroup })
    }

    return groups
}

function MessageParts({
    parts,
    showReasoningSummaries,
    streaming = false,
}: {
    parts: ChatMessagePart[]
    showReasoningSummaries: boolean
    streaming?: boolean
}) {
    const grouped = useMemo(() => groupParts(parts), [parts])

    return (
        <>
            {grouped.map((group, idx) => {
                if (group.kind === 'tool-group') {
                    return <ToolGroup key={`tg-${idx}`} tools={group.tools} />
                }
                const { part } = group
                if (part.type === 'reasoning' && part.content && showReasoningSummaries) {
                    return <ReasoningBlock key={part.id} content={part.content} streaming={streaming} />
                }
                if (part.type === 'compaction') {
                    return (
                        <div key={part.id} className="compaction-divider">
                            <span className="compaction-divider__line" />
                            <span className="compaction-divider__label">
                                {part.compaction?.auto ? 'auto compacted' : 'compacted'}
                            </span>
                            <span className="compaction-divider__line" />
                        </div>
                    )
                }
                return null
            })}
        </>
    )
}

function CopyResponseButton({ content }: { content: string }) {
    const [copied, setCopied] = useState(false)
    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [content])

    if (!content.trim()) return null

    return (
        <div className="text-copy-wrapper">
            <button
                className="text-copy-btn"
                onClick={handleCopy}
                title={copied ? 'Copied!' : 'Copy response'}
            >
                {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
        </div>
    )
}

function ChatMessageContent({
    message,
    className = 'assistant-body',
    streaming = false,
}: ChatMessageContentProps) {
    const showReasoningSummaries = useUISettings((state) => state.showReasoningSummaries)
    const rawContent = useMemo(() => stripAssistantActionBlock(message.content || ''), [message.content])
    const deferredContent = useDeferredValue(rawContent)
    const displayContent = streaming ? rawContent : deferredContent
    const showThinking = showReasoningSummaries

    return (
        <div className={className}>
            {message.parts && message.parts.length > 0 ? (
                <MessageParts parts={message.parts} showReasoningSummaries={showThinking} streaming={streaming} />
            ) : null}
            {displayContent ? (
                <>
                    <MarkdownRenderer content={displayContent} showThinking={showThinking} streaming={streaming} />
                    {!streaming ? <CopyResponseButton content={rawContent} /> : null}
                </>
            ) : null}
        </div>
    )
}

type ChatMessageContentProps = {
    message: Pick<ChatMessage, 'content' | 'parts'>
    className?: string
    streaming?: boolean
}

export default memo(ChatMessageContent, (prev, next) => (
    prev.message === next.message
    && prev.className === next.className
    && prev.streaming === next.streaming
))
