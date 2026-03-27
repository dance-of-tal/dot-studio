import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import type { ChatMessage, ChatMessagePart, ChatMessageToolInfo } from '../../types'
import { stripAssistantActionBlock } from '../assistant/assistant-protocol'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { ToolGroup } from './ToolGroup'

/** Throttle a rapidly changing value to update at most every `ms` milliseconds */
function useThrottledValue<T>(value: T, ms = 100): T {
    const [throttled, setThrottled] = useState(value)
    const lastUpdate = useRef(Date.now())
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => {
        const now = Date.now()
        const elapsed = now - lastUpdate.current
        if (elapsed >= ms) {
            lastUpdate.current = now
            setThrottled(value)
        } else {
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
                lastUpdate.current = Date.now()
                setThrottled(value)
                timer.current = undefined
            }, ms - elapsed)
        }
        return () => { if (timer.current) clearTimeout(timer.current) }
    }, [value, ms])

    return throttled
}

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

export function hasVisibleAssistantMessageContent(message: Pick<ChatMessage, 'content' | 'parts'>): boolean {
    const visibleText = stripAssistantActionBlock(message.content || '').trim()
    if (visibleText) {
        return true
    }

    return !!message.parts?.some((part) =>
        part.type === 'tool'
        || part.type === 'compaction'
        || (part.type === 'reasoning' && !!part.content?.trim()),
    )
}

function ReasoningBlock({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false)
    const preview = stripMarkdownMarkers(content).slice(0, 200)
    return (
        <div className="thinking-row">
            <button className="thinking-row__header" onClick={() => setExpanded(!expanded)}>
                <span className="thinking-row__chevron">
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
                <span className="thinking-row__label">
                    <TextShimmer text="Thinking" active={false} />
                </span>
                {!expanded && preview ? (
                    <span className="thinking-row__preview">
                        {preview}{content.length > 200 ? '…' : ''}
                    </span>
                ) : null}
            </button>
            {expanded ? (
                <div className="thinking-row__content">
                    <MarkdownRenderer content={content} />
                </div>
            ) : null}
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

function MessageParts({ parts }: { parts: ChatMessagePart[] }) {
    const grouped = useMemo(() => groupParts(parts), [parts])

    return (
        <>
            {grouped.map((group, idx) => {
                if (group.kind === 'tool-group') {
                    return <ToolGroup key={`tg-${idx}`} tools={group.tools} />
                }
                const { part } = group
                if (part.type === 'reasoning' && part.content) {
                    return <ReasoningBlock key={part.id} content={part.content} />
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

export default function ChatMessageContent({
    message,
    className = 'assistant-body',
}: {
    message: Pick<ChatMessage, 'content' | 'parts'>
    className?: string
}) {
    const rawContent = useMemo(() => stripAssistantActionBlock(message.content || ''), [message.content])
    const displayContent = useThrottledValue(rawContent, 100)

    return (
        <div className={className}>
            {message.parts && message.parts.length > 0 ? <MessageParts parts={message.parts} /> : null}
            {displayContent ? (
                <>
                    <MarkdownRenderer content={displayContent} />
                    <CopyResponseButton content={rawContent} />
                </>
            ) : null}
        </div>
    )
}
