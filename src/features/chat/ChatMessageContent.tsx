import { useState, useMemo } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import type { ChatMessage, ChatMessagePart, ChatMessageToolInfo } from '../../types'

function formatToolDuration(time: ChatMessageToolInfo['time']) {
    if (!time?.start) {
        return null
    }
    const durationMs = Math.max(0, (time.end || Date.now()) - time.start)
    if (durationMs < 1000) {
        return `${durationMs}ms`
    }
    if (durationMs < 60_000) {
        return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`
    }
    const minutes = Math.floor(durationMs / 60_000)
    const seconds = Math.round((durationMs % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
}

function ToolStatusIcon({ status }: { status: ChatMessageToolInfo['status'] }) {
    if (status === 'pending' || status === 'running') {
        return <Loader2 size={12} className="spin-icon" />
    }
    if (status === 'completed') {
        return <Check size={12} />
    }
    if (status === 'error') {
        return <AlertTriangle size={12} />
    }
    return null
}

function ToolCallRow({ tool }: { tool: ChatMessageToolInfo }) {
    const [expanded, setExpanded] = useState(false)
    const statusClass = `tool-row--${tool.status}`
    const durationLabel = formatToolDuration(tool.time)
    const displayName = tool.title || tool.name

    return (
        <div className={`tool-row ${statusClass}`}>
            <button className="tool-row__header" onClick={() => setExpanded(!expanded)}>
                <span className="tool-row__indicator">
                    <ToolStatusIcon status={tool.status} />
                </span>
                <Wrench size={10} className="tool-row__wrench" />
                <span className="tool-row__name">{displayName}</span>
                {durationLabel ? <span className="tool-row__duration">{durationLabel}</span> : null}
                <span className="tool-row__chevron">
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
            </button>
            {expanded ? (
                <div className="tool-row__detail">
                    {tool.input && Object.keys(tool.input).length > 0 ? (
                        <div className="tool-row__section">
                            <span className="tool-row__section-label">Input</span>
                            <pre className="tool-row__pre">{JSON.stringify(tool.input, null, 2)}</pre>
                        </div>
                    ) : null}
                    {tool.output ? (
                        <div className="tool-row__section">
                            <span className="tool-row__section-label">Output</span>
                            <pre className="tool-row__pre">{tool.output.length > 500 ? `${tool.output.slice(0, 500)}...` : tool.output}</pre>
                        </div>
                    ) : null}
                    {tool.error ? (
                        <div className="tool-row__section tool-row__section--error">
                            <span className="tool-row__section-label">Error</span>
                            <pre className="tool-row__pre">{tool.error}</pre>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

function ToolGroup({ tools }: { tools: ChatMessageToolInfo[] }) {
    const [collapsed, setCollapsed] = useState(false)

    // Single tool: no group wrapper
    if (tools.length === 1) {
        return <ToolCallRow tool={tools[0]} />
    }

    const completedCount = tools.filter((t) => t.status === 'completed').length
    const runningCount = tools.filter((t) => t.status === 'running' || t.status === 'pending').length
    const errorCount = tools.filter((t) => t.status === 'error').length

    return (
        <div className="tool-group">
            <button className="tool-group__header" onClick={() => setCollapsed(!collapsed)}>
                <span className="tool-group__indicator">
                    {runningCount > 0
                        ? <Loader2 size={12} className="spin-icon" />
                        : errorCount > 0
                            ? <AlertTriangle size={12} />
                            : <Check size={12} />}
                </span>
                <Wrench size={10} className="tool-group__wrench" />
                <span className="tool-group__label">
                    {runningCount > 0
                        ? `${completedCount}/${tools.length} tools used`
                        : `${tools.length} tools used`}
                </span>
                {errorCount > 0 ? <span className="tool-group__error-badge">{errorCount} error{errorCount > 1 ? 's' : ''}</span> : null}
                <span className="tool-group__chevron">
                    {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                </span>
            </button>
            {!collapsed ? (
                <div className="tool-group__list">
                    {tools.map((tool) => (
                        <ToolCallRow key={tool.callId} tool={tool} />
                    ))}
                </div>
            ) : null}
        </div>
    )
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
    return (
        <div className={className}>
            {message.parts && message.parts.length > 0 ? <MessageParts parts={message.parts} /> : null}
            {message.content ? <MarkdownRenderer content={message.content} /> : null}
        </div>
    )
}
