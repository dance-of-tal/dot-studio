import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Loader2, Plus, Send, Square } from 'lucide-react'
import type { ActPerformerSessionBinding, ChatMessage } from '../../types'
import ChatMessageContent from './ChatMessageContent'
import ThreadBody from './ThreadBody'

type ActThreadNode = {
    id: string
    label: string
}

type ActThreadEdge = {
    id: string
    from: string
    to: string
}

type RuntimeGraphLayout = {
    width: number
    height: number
    positions: Record<string, { x: number; y: number }>
}

type ActThreadMessage = ChatMessage

type ActFeedMessage = ChatMessage & {
    key: string
    source: 'thread' | 'performer'
    header: string
    subheader?: string | null
}

type ActThreadPanelProps = {
    sessionStatus: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted' | null
    entryNodeId: string | null
    entryLabel: string | null
    nodes: ActThreadNode[]
    edges: ActThreadEdge[]
    runtimeGraph: RuntimeGraphLayout
    activeRuntimeNodeId: string | null
    completedRuntimeNodeIds: Set<string>
    failedRuntimeNodeIds: Set<string>
    threadMessages: ActThreadMessage[]
    performerThreadMessages: Record<string, ChatMessage[]>
    performerThreadBindings: ActPerformerSessionBinding[]
    loading: boolean
    threadInput: string
    canSendThread: boolean
    threadEndRef: RefObject<HTMLDivElement | null>
    onThreadInputChange: (value: string) => void
    onSend: (message: string) => Promise<void> | void
    onStop?: () => Promise<void> | void
    onNewSession?: () => void
}

function formatFeedTime(timestamp: number) {
    try {
        return new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        }).format(new Date(timestamp))
    } catch {
        return ''
    }
}

export default function ActThreadPanel({
    sessionStatus,
    entryNodeId,
    entryLabel,
    nodes,
    edges,
    runtimeGraph,
    activeRuntimeNodeId,
    completedRuntimeNodeIds,
    failedRuntimeNodeIds,
    threadMessages,
    performerThreadMessages,
    performerThreadBindings,
    loading,
    threadInput,
    canSendThread,
    threadEndRef,
    onThreadInputChange,
    onSend,
    onStop,
    onNewSession,
}: ActThreadPanelProps) {
    const [performerFilter, setPerformerFilter] = useState<string>('all')
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
    const historyRef = useRef<HTMLDivElement | null>(null)
    const minimapRef = useRef<HTMLDivElement | null>(null)
    const [minimapWidth, setMinimapWidth] = useState(0)
    const statusToneClass = sessionStatus === 'interrupted'
        ? 'act-area-frame__thread-meta-pill--warn'
        : 'act-area-frame__thread-meta-pill--status'

    const performerFilters = useMemo(() => {
        const uniqueBindings = Array.from(new Map(
            performerThreadBindings.map((binding) => [binding.sessionId, binding]),
        ).values())
        const seen = new Set<string>()
        return uniqueBindings.flatMap((binding) => {
            const value = binding.performerId || `session:${binding.sessionId}`
            if (seen.has(value)) {
                return []
            }
            seen.add(value)
            return [{
                value,
                label: binding.performerName || binding.nodeLabel || binding.sessionId,
            }]
        })
    }, [performerThreadBindings])

    useEffect(() => {
        if (performerFilter === 'all') {
            return
        }
        if (!performerFilters.some((filter) => filter.value === performerFilter)) {
            setPerformerFilter('all')
        }
    }, [performerFilter, performerFilters])

    const feedMessages = useMemo<ActFeedMessage[]>(() => {
        const uniqueBindings = Array.from(new Map(
            performerThreadBindings.map((binding) => [binding.sessionId, binding]),
        ).values())
        const baseMessages = threadMessages
            .filter((message) => performerFilter === 'all' || message.role !== 'assistant')
            .map((message) => ({
                ...message,
                key: `thread:${message.id}`,
                source: 'thread' as const,
                header: message.role === 'assistant'
                    ? 'Act result'
                    : message.role === 'user'
                        ? 'Prompt'
                        : 'System',
                subheader: formatFeedTime(message.timestamp),
            }))

        const performerMessages = uniqueBindings
            .filter((binding) => (
                performerFilter === 'all'
                || performerFilter === (binding.performerId || `session:${binding.sessionId}`)
            ))
            .flatMap((binding) => (
                (performerThreadMessages[binding.sessionId] || [])
                    .filter((message) => message.role !== 'user')
                    .map((message) => ({
                        ...message,
                        key: `${binding.sessionId}:${message.id}`,
                        source: 'performer' as const,
                        header: binding.performerName || binding.nodeLabel || binding.sessionId,
                        subheader: `${binding.nodeLabel} · ${formatFeedTime(message.timestamp)}`,
                    }))
            ))

        const deduped = new Map<string, ActFeedMessage>()
        for (const message of [...baseMessages, ...performerMessages]) {
            deduped.set(message.key, message)
        }

        return [...deduped.values()].sort((a, b) => a.timestamp - b.timestamp)
    }, [performerFilter, performerThreadBindings, performerThreadMessages, threadMessages])

    const submitThread = () => {
        if (!canSendThread) {
            return
        }
        const next = threadInput.trim()
        onThreadInputChange('')
        void onSend(next)
    }

    useEffect(() => {
        const history = historyRef.current
        if (!history || !autoScrollEnabled) {
            return
        }
        history.scrollTo({
            top: history.scrollHeight,
            behavior: loading ? 'auto' : 'smooth',
        })
    }, [autoScrollEnabled, feedMessages, loading])

    const handleHistoryScroll = () => {
        const history = historyRef.current
        if (!history) {
            return
        }
        const distanceFromBottom = history.scrollHeight - history.scrollTop - history.clientHeight
        setAutoScrollEnabled(distanceFromBottom < 24)
    }

    useEffect(() => {
        const minimap = minimapRef.current
        if (!minimap) {
            return
        }

        const updateWidth = () => {
            setMinimapWidth(minimap.clientWidth)
        }

        updateWidth()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateWidth)
            return () => window.removeEventListener('resize', updateWidth)
        }

        const observer = new ResizeObserver(() => updateWidth())
        observer.observe(minimap)
        return () => observer.disconnect()
    }, [])

    const minimapScale = useMemo(() => {
        if (!runtimeGraph.width || !runtimeGraph.height || !minimapWidth) {
            return 1
        }
        const widthScale = (minimapWidth - 8) / runtimeGraph.width
        const heightScale = 220 / runtimeGraph.height
        return Math.min(1, widthScale, heightScale)
    }, [minimapWidth, runtimeGraph.height, runtimeGraph.width])

    const minimapHeight = Math.max(40, runtimeGraph.height * minimapScale)

    return (
        <div className="act-area-frame__thread-shell">
            <div className="act-area-frame__thread-graph">
                <div className="act-area-frame__thread-head">
                    <div className="act-area-frame__thread-head-copy">
                        <strong>{'Act Runtime'}</strong>
                        <div className="act-area-frame__thread-meta">
                            <span className={`act-area-frame__thread-meta-pill ${statusToneClass}`}>{sessionStatus || 'idle'}</span>
                            <span className="act-area-frame__thread-meta-pill">{nodes.length} node{nodes.length === 1 ? '' : 's'}</span>
                            {entryLabel
                                ? <span className="act-area-frame__thread-meta-pill">entry: {entryLabel}</span>
                                : <span className="act-area-frame__thread-meta-pill act-area-frame__thread-meta-pill--warn">no entry node</span>}
                        </div>
                    </div>
                    <div className="act-area-frame__thread-actions">
                        {loading ? (
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    void onStop?.()
                                }}
                                title="Stop current act run"
                            >
                                <Square size={12} />
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="icon-btn"
                            onClick={(event) => {
                                event.stopPropagation()
                                onNewSession?.()
                            }}
                            title="Start a new act thread"
                        >
                            <Plus size={12} />
                        </button>
                    </div>
                </div>
                <div ref={minimapRef} className="act-area-frame__graph-minimap" style={{ height: minimapHeight }}>
                    <div
                        className="act-area-frame__graph-minimap-inner"
                        style={{
                            width: runtimeGraph.width,
                            height: runtimeGraph.height,
                            transform: `scale(${minimapScale})`,
                        }}
                    >
                        <svg
                            className="act-area-frame__graph-edges"
                            width={runtimeGraph.width}
                            height={runtimeGraph.height}
                            aria-hidden="true"
                        >
                            {edges.map((edge) => {
                                const from = runtimeGraph.positions[edge.from]
                                const to = runtimeGraph.positions[edge.to]
                                if (!from || !to) {
                                    return null
                                }
                                const completed = completedRuntimeNodeIds.has(edge.from) && completedRuntimeNodeIds.has(edge.to)
                                return (
                                    <line
                                        key={`runtime-edge-${edge.id}`}
                                        x1={from.x + 46}
                                        y1={from.y + 17}
                                        x2={to.x + 46}
                                        y2={to.y + 17}
                                        className={`act-area-frame__graph-edge ${completed ? 'is-completed' : ''}`}
                                    />
                                )
                            })}
                        </svg>
                        {nodes.map((node) => {
                            const position = runtimeGraph.positions[node.id]
                            if (!position) {
                                return null
                            }
                            const statusClass = failedRuntimeNodeIds.has(node.id)
                                ? 'is-failed'
                                : activeRuntimeNodeId === node.id
                                    ? 'is-active'
                                    : completedRuntimeNodeIds.has(node.id)
                                        ? 'is-completed'
                                        : ''
                            return (
                                <div
                                    key={`runtime-node-${node.id}`}
                                    className={`act-area-frame__graph-node ${statusClass} ${entryNodeId === node.id ? 'is-entry' : ''}`}
                                    style={{ left: position.x, top: position.y }}
                                >
                                    <span>{node.label}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
            {performerFilters.length > 0 ? (
                <div className="act-area-frame__thread-filters">
                    <button
                        type="button"
                        className={`act-area-frame__thread-filter ${performerFilter === 'all' ? 'is-active' : ''}`}
                        onClick={() => setPerformerFilter('all')}
                    >
                        All
                    </button>
                    {performerFilters.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            className={`act-area-frame__thread-filter ${performerFilter === filter.value ? 'is-active' : ''}`}
                            onClick={() => setPerformerFilter(filter.value)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            ) : null}
            <ThreadBody
                messages={feedMessages}
                loading={loading}
                historyClassName="act-area-frame__thread-messages figma-scroll"
                historyRef={historyRef}
                onHistoryScroll={handleHistoryScroll}
                renderEmpty={() => (
                    <div className="act-area-frame__thread-empty">
                        <strong>No messages yet.</strong>
                        <span>
                            {entryNodeId
                                ? 'Send a prompt to run this act. Performer outputs will appear here in real time.'
                                : 'Open Edit and set an entry node before sending prompts.'}
                        </span>
                    </div>
                )}
                renderMessage={(message) => (
                    <div key={message.key} className={`act-area-frame__thread-message act-area-frame__thread-message--${message.role}`}>
                        <div className="act-area-frame__thread-message-head">
                            <span className="act-area-frame__thread-role">{message.header}</span>
                            {message.subheader ? <span className="act-area-frame__thread-subrole">{message.subheader}</span> : null}
                        </div>
                        {message.role === 'user'
                            ? (
                                <div className="act-area-frame__thread-body">
                                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</span>
                                </div>
                            )
                            : <ChatMessageContent message={message} className="act-area-frame__thread-body" />}
                    </div>
                )}
                renderLoading={() => (
                    <div className="act-area-frame__thread-loading">
                        <Loader2 size={13} className="spin-icon" />
                        <span>Running act...</span>
                    </div>
                )}
                endRef={threadEndRef}
                composer={(
                    <div className="act-area-frame__thread-composer">
                        {!autoScrollEnabled ? (
                            <div className="act-area-frame__chat-note">
                                Auto-scroll paused while you're reviewing older output. Scroll back to the bottom to resume.
                            </div>
                        ) : null}
                        <div className="act-area-frame__chat-input">
                            <textarea
                                className="act-area-frame__chat-textarea nowheel"
                                value={threadInput}
                                onChange={(event) => {
                                    onThreadInputChange(event.target.value)
                                    event.target.style.height = '0'
                                    event.target.style.height = `${event.target.scrollHeight}px`
                                    event.target.style.overflowY = event.target.scrollHeight > 128 ? 'auto' : 'hidden'
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault()
                                        submitThread()
                                    }
                                }}
                                placeholder={entryNodeId ? 'Start the prompt with the init node.' : 'Set an entry node in Edit mode to run this act.'}
                                disabled={!entryNodeId || loading}
                                rows={1}
                            />
                            <button
                                type="button"
                                className={`act-area-frame__thread-send ${loading ? 'is-stop' : ''}`}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    if (loading) {
                                        void onStop?.()
                                        return
                                    }
                                    submitThread()
                                }}
                                disabled={loading ? false : !canSendThread}
                            >
                                {loading ? <Square size={14} /> : <Send size={14} />}
                                <span>{loading ? 'Stop' : 'Run Act'}</span>
                            </button>
                        </div>
                    </div>
                )}
            />
        </div>
    )
}
