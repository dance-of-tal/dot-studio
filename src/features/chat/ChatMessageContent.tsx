import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import type { ChatMessage, ChatMessagePart, ChatMessageToolInfo } from '../../types'
import { stripAssistantActionBlock } from '../assistant/assistant-protocol'

import { ToolGroup } from './ToolGroup'

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

function ReasoningBlock({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false)
    const preview = stripMarkdownMarkers(content).slice(0, 200)
    return (
        <div className="thinking-row">
            <button className="thinking-row__header" onClick={() => setExpanded(!expanded)}>
                <span className="thinking-row__chevron">
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
                <span className="thinking-row__label">Thinking</span>
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

export default function ChatMessageContent({
    message,
    className = 'assistant-body',
}: {
    message: Pick<ChatMessage, 'content' | 'parts'>
    className?: string
}) {
    const displayContent = useMemo(() => stripAssistantActionBlock(message.content || ''), [message.content])

    return (
        <div className={className}>
            {message.parts && message.parts.length > 0 ? <MessageParts parts={message.parts} /> : null}
            {displayContent ? <MarkdownRenderer content={displayContent} /> : null}
        </div>
    )
}
