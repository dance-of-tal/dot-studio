import { useState } from 'react'
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

function compactToolText(value: string) {
    return value
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0)
}

function buildToolPreview(tool: ChatMessageToolInfo) {
    if (tool.error?.trim()) {
        return compactToolText(tool.error).slice(-2).join('  ')
    }
    if (tool.output?.trim()) {
        return compactToolText(tool.output).slice(-3).join('  ')
    }
    if (tool.status === 'running' || tool.status === 'pending') {
        if (typeof tool.input?.command === 'string' && tool.input.command.trim()) {
            return `Running: ${tool.input.command.trim()}`
        }
        if (typeof tool.title === 'string' && tool.title.trim()) {
            return tool.title.trim()
        }
        return 'Working...'
    }
    return null
}

function ToolCallCard({ tool }: { tool: ChatMessageToolInfo }) {
    const [expanded, setExpanded] = useState(false)
    const statusClass = `tool-call-card--${tool.status}`
    const durationLabel = formatToolDuration(tool.time)
    const preview = buildToolPreview(tool)

    return (
        <div className={`tool-call-card ${statusClass}`}>
            <button className="tool-call-header" onClick={() => setExpanded(!expanded)}>
                <span className="tool-call-icon">
                    {tool.status === 'pending' && <Loader2 size={12} className="spin-icon" />}
                    {tool.status === 'running' && <Loader2 size={12} className="spin-icon" />}
                    {tool.status === 'completed' && <Check size={12} />}
                    {tool.status === 'error' && <AlertTriangle size={12} />}
                </span>
                <span className="tool-call-name">
                    <Wrench size={10} style={{ marginRight: 4, opacity: 0.6 }} />
                    {tool.title || tool.name}
                </span>
                <span className="tool-call-status-label">{tool.status}</span>
                {durationLabel ? <span className="tool-call-duration">{durationLabel}</span> : null}
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {!expanded && preview ? (
                <div className="tool-call-preview">{preview}</div>
            ) : null}
            {expanded ? (
                <div className="tool-call-detail">
                    {tool.input && Object.keys(tool.input).length > 0 ? (
                        <div className="tool-call-section">
                            <span className="tool-call-section-label">Input</span>
                            <pre className="tool-call-pre">{JSON.stringify(tool.input, null, 2)}</pre>
                        </div>
                    ) : null}
                    {tool.output ? (
                        <div className="tool-call-section">
                            <span className="tool-call-section-label">Output</span>
                            <pre className="tool-call-pre">{tool.output.length > 500 ? `${tool.output.slice(0, 500)}...` : tool.output}</pre>
                        </div>
                    ) : null}
                    {tool.error ? (
                        <div className="tool-call-section tool-call-section--error">
                            <span className="tool-call-section-label">Error</span>
                            <pre className="tool-call-pre">{tool.error}</pre>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

function ReasoningBlock({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false)
    return (
        <div className="thinking-block">
            <button className="thinking-toggle" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="thinking-label">Thinking</span>
                {!expanded ? (
                    <span className="thinking-preview">
                        {content.slice(0, 80)}...
                    </span>
                ) : null}
            </button>
            {expanded ? <div className="thinking-content">{content}</div> : null}
        </div>
    )
}

function MessageParts({ parts }: { parts: ChatMessagePart[] }) {
    return (
        <>
            {parts.map((part) => {
                if (part.type === 'reasoning' && part.content) {
                    return <ReasoningBlock key={part.id} content={part.content} />
                }
                if (part.type === 'tool' && part.tool) {
                    return <ToolCallCard key={part.id} tool={part.tool} />
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
