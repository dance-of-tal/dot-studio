/**
 * ActBoardView — Shared Board viewer for Act threads.
 *
 * Displays board entries (shared notes) as cards with kind badges,
 * author labels, content preview, and version info.
 * Includes a compact activity timeline at the bottom.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Clipboard, FileText,
    MessageCircle, Clock, Bell, RefreshCw, Pin,
    Activity,
} from 'lucide-react'
import { api } from '../../api'
import './ActBoardView.css'

interface BoardEntry {
    id: string
    key: string
    kind: 'artifact' | 'fact' | 'task' | 'note'
    author: string
    content: string
    version: number
    timestamp: number
    pinned?: boolean
    locked?: boolean
    status?: 'open' | 'in_progress' | 'done'
}

interface ActivityEvent {
    id: string
    type: string
    source: string
    timestamp: number
    payload: Record<string, unknown>
}

type FilterKind = 'all' | 'artifact' | 'fact' | 'task'

const KIND_LABELS: Record<FilterKind, string> = {
    all: 'All',
    artifact: 'Artifacts',
    fact: 'Facts',
    task: 'Tasks',
}

const STATUS_LABELS: Record<string, string> = {
    open: 'open',
    in_progress: 'in progress',
    done: 'done',
}

function toBoardEntry(raw: Record<string, unknown>): BoardEntry | null {
    if (typeof raw.key !== 'string' || typeof raw.content !== 'string') return null
    return {
        id: typeof raw.id === 'string' ? raw.id : String(raw.key),
        key: raw.key,
        kind: (['artifact', 'fact', 'task', 'note'].includes(raw.kind as string)
            ? raw.kind : 'note') as BoardEntry['kind'],
        author: typeof raw.author === 'string' ? raw.author : 'unknown',
        content: raw.content,
        version: typeof raw.version === 'number' ? raw.version : 1,
        timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
        pinned: !!raw.pinned,
        locked: !!raw.locked,
        status: ['open', 'in_progress', 'done'].includes(raw.status as string)
            ? (raw.status as BoardEntry['status'])
            : undefined,
    }
}

function toActivityEvent(raw: Record<string, unknown>, idx: number): ActivityEvent | null {
    return {
        id: typeof raw.id === 'string' ? raw.id : `evt-${idx}`,
        type: typeof raw.type === 'string' ? raw.type : 'unknown',
        source: typeof raw.source === 'string' ? raw.source : 'runtime',
        timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
        payload: raw.payload && typeof raw.payload === 'object'
            ? raw.payload as Record<string, unknown> : {},
    }
}

function relativeTime(ts: number): string {
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
    if (diff < 10) return 'just now'
    if (diff < 60) return `${diff}s ago`
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

function getEventDescription(event: ActivityEvent): string {
    const { type, source, payload } = event
    switch (type) {
        case 'message.sent':
            return `${source} → ${payload.to}${payload.tag ? ` [${payload.tag}]` : ''}`
        case 'board.posted':
        case 'board.updated':
            return `${source} updated "${payload.key}"`
        case 'runtime.idle':
            return 'Runtime idle'
        default:
            return `${source}: ${type}`
    }
}

function getEventIcon(type: string) {
    switch (type) {
        case 'message.sent':
        case 'message.delivered':
            return <MessageCircle size={9} />
        case 'board.posted':
        case 'board.updated':
            return <FileText size={9} />
        case 'runtime.idle':
            return <Clock size={9} />
        default:
            return <Bell size={9} />
    }
}

interface ActBoardViewProps {
    actId: string
    threadId: string
}

export default function ActBoardView({ actId, threadId }: ActBoardViewProps) {
    const [entries, setEntries] = useState<BoardEntry[]>([])
    const [events, setEvents] = useState<ActivityEvent[]>([])
    const [filter, setFilter] = useState<FilterKind>('all')
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [lastUpdated, setLastUpdated] = useState<number | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [boardResult, eventResult] = await Promise.all([
                api.actRuntime.readBoard(actId, threadId),
                api.actRuntime.events(actId, threadId, 10),
            ])
            setEntries(
                (boardResult.entries || [])
                    .map(toBoardEntry)
                    .filter((e): e is BoardEntry => e !== null)
                    .sort((a, b) => b.timestamp - a.timestamp),
            )
            setEvents(
                (eventResult.events || [])
                    .map((e, i) => toActivityEvent(e, i))
                    .filter((e): e is ActivityEvent => e !== null)
                    .slice(0, 10),
            )
            setLastUpdated(Date.now())
        } catch (err) {
            console.error('[ActBoardView] Failed to load board data', err)
        } finally {
            setLoading(false)
        }
    }, [actId, threadId])

    useEffect(() => { loadData() }, [loadData])

    // Auto-refresh every 5 seconds
    useEffect(() => {
        const interval = setInterval(loadData, 5000)
        return () => clearInterval(interval)
    }, [loadData])

    const filteredEntries = useMemo(() =>
        filter === 'all'
            ? entries
            : entries.filter((e) => e.kind === filter),
        [entries, filter],
    )

    const kindCounts = useMemo(() => {
        const counts: Record<string, number> = { all: entries.length }
        for (const e of entries) {
            counts[e.kind] = (counts[e.kind] || 0) + 1
        }
        return counts
    }, [entries])

    const toggleExpand = useCallback((key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }, [])

    return (
        <div className="act-board">
            <div className="act-board__header">
                <div className="act-board__tabs" role="tablist" aria-label="Board filters">
                    {(Object.keys(KIND_LABELS) as FilterKind[]).map((kind) => (
                        <button
                            key={kind}
                            className={`act-board__tab ${filter === kind ? 'act-board__tab--active' : ''}`}
                            onClick={() => setFilter(kind)}
                            role="tab"
                            aria-selected={filter === kind}
                        >
                            <span>{KIND_LABELS[kind]}</span>
                            {(kindCounts[kind] || 0) > 0 && (
                                <span className="act-board__tab-count">
                                    {kindCounts[kind]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="act-board__toolbar">
                    {lastUpdated && (
                        <span className="act-board__freshness">
                            {relativeTime(lastUpdated)}
                        </span>
                    )}
                    <button
                        className="icon-btn act-board__refresh-btn"
                        onClick={loadData}
                        disabled={loading}
                        title="Refresh"
                    >
                        <RefreshCw size={10} className={loading ? 'spinning' : ''} />
                    </button>
                </div>
            </div>

            {filteredEntries.length === 0 ? (
                <div className="act-board__empty">
                    <Clipboard size={20} className="act-board__empty-icon" />
                    <span>
                        {entries.length === 0
                            ? 'No shared notes yet'
                            : `No ${KIND_LABELS[filter].toLowerCase()} found`}
                    </span>
                    <span className="act-board__empty-hint">
                        Participants can post shared notes using the update_shared_board tool during collaboration.
                    </span>
                </div>
            ) : (
                <div className="act-board__cards scroll-area">
                    {filteredEntries.map((entry) => {
                        const isExpanded = expandedKeys.has(entry.key)
                        const isLong = entry.content.length > 200

                        return (
                            <div key={entry.id} className="act-board__card">
                                <div className="act-board__card-header">
                                    <span className={`act-board__badge act-board__badge--${entry.kind}`}>
                                        {entry.kind}
                                    </span>
                                    {entry.kind === 'task' && entry.status && (
                                        <span className="act-board__task-status">
                                            <span className={`act-board__task-dot act-board__task-dot--${entry.status}`} />
                                            <span className={`act-board__task-label--${entry.status}`}>
                                                {STATUS_LABELS[entry.status]}
                                            </span>
                                        </span>
                                    )}
                                    <span className="act-board__card-title">{entry.key}</span>
                                    <span className="act-board__card-author">{entry.author}</span>
                                </div>
                                <div
                                    className={`act-board__card-content ${isExpanded ? 'act-board__card-content--expanded' : ''}`}
                                >
                                    {entry.content}
                                </div>
                                {isLong && (
                                    <button
                                        className="act-board__expand-btn"
                                        onClick={() => toggleExpand(entry.key)}
                                    >
                                        {isExpanded ? 'Show less' : 'Show more'}
                                    </button>
                                )}
                                <div className="act-board__card-footer">
                                    {entry.pinned && <Pin size={8} className="act-board__pin" />}
                                    <span>v{entry.version}</span>
                                    <span>&middot;</span>
                                    <span>{relativeTime(entry.timestamp)}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {events.length > 0 && (
                <div className="act-board__activity">
                    <div className="act-board__activity-header">
                        <Activity size={9} />
                        <span>Recent Activity</span>
                    </div>
                    <div className="act-board__activity-list scroll-area">
                        {events.map((event) => (
                            <div key={event.id} className="act-board__activity-item">
                                <span className="act-board__activity-icon">
                                    {getEventIcon(event.type)}
                                </span>
                                <span className="act-board__activity-copy">{getEventDescription(event)}</span>
                                <span className="act-board__activity-time">
                                    {relativeTime(event.timestamp)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
