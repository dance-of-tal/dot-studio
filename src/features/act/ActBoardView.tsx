/**
 * ActBoardView — Shared Board viewer for Act threads.
 *
 * Displays board entries (shared notes) as cards with kind badges,
 * author labels, content preview, and version info.
 * Includes a compact recent-activity sidebar with incremental loading.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
    Clipboard, FileText,
    MessageCircle, Clock, Bell, RefreshCw, Pin,
    Activity,
} from 'lucide-react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import {
    FILTER_KINDS,
    KIND_LABELS,
    type FilterKind,
    filterBoardEntries,
    getBoardKindCounts,
    getEventDescription,
    mergeActivityPages,
    resolveBoardActorLabel,
} from './act-board-view-utils'
import './ActBoardView.css'

interface BoardEntry {
    id: string
    key: string
    kind: 'artifact' | 'finding' | 'task' | 'note'
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

const ACTIVITY_PAGE_SIZE = 10

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
        kind: (['artifact', 'finding', 'task', 'note'].includes(raw.kind as string)
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
    const act = useStudioStore((state) => state.acts.find((item) => item.id === actId) || null)
    const performers = useStudioStore((state) => state.performers)
    const activityListRef = useRef<HTMLDivElement | null>(null)
    const fullEntryKeysRef = useRef<Set<string>>(new Set())
    const [entries, setEntries] = useState<BoardEntry[]>([])
    const [filter, setFilter] = useState<FilterKind>('artifact')
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [loadingMoreEvents, setLoadingMoreEvents] = useState(false)
    const [loadingExpandedKeys, setLoadingExpandedKeys] = useState<Set<string>>(new Set())
    const [lastUpdated, setLastUpdated] = useState<number | null>(null)
    const [activityState, setActivityState] = useState<{
        events: ActivityEvent[]
        hasMore: boolean
        nextBefore: number
    }>({
        events: [],
        hasMore: false,
        nextBefore: 0,
    })

    useEffect(() => {
        fullEntryKeysRef.current = new Set()
        setEntries([])
        setExpandedKeys(new Set())
        setLoadingExpandedKeys(new Set())
        setLastUpdated(null)
        setActivityState({
            events: [],
            hasMore: false,
            nextBefore: 0,
        })
    }, [actId, threadId])

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [boardResult, eventResult] = await Promise.all([
                api.actRuntime.readBoard(actId, threadId),
                api.actRuntime.events(actId, threadId, ACTIVITY_PAGE_SIZE),
            ])
            setEntries(
                (prev) => {
                    const previousByKey = new Map(prev.map((entry) => [entry.key, entry]))
                    return (boardResult.entries || [])
                        .map(toBoardEntry)
                        .filter((e): e is BoardEntry => e !== null)
                        .map((entry) => {
                            const previous = previousByKey.get(entry.key)
                            if (!previous) return entry
                            if (!fullEntryKeysRef.current.has(entry.key)) return entry
                            if (previous.version !== entry.version) {
                                fullEntryKeysRef.current.delete(entry.key)
                                return entry
                            }
                            return {
                                ...entry,
                                content: previous.content,
                            }
                        })
                        .sort((a, b) => b.timestamp - a.timestamp)
                },
            )
            const pageEvents = (eventResult.events || [])
                .map((event, index) => toActivityEvent(event, index))
                .filter((event): event is ActivityEvent => event !== null)

            setActivityState((prev) => {
                const merged = mergeActivityPages(prev.events, pageEvents, 'prependLatest')
                const total = typeof eventResult.total === 'number' ? eventResult.total : merged.length
                return {
                    events: merged,
                    hasMore: merged.length < total,
                    nextBefore: merged.length,
                }
            })
            setLastUpdated(Date.now())
        } catch (err) {
            console.error('[ActBoardView] Failed to load board data', err)
        } finally {
            setLoading(false)
        }
    }, [actId, threadId])

    const loadMoreEvents = useCallback(async () => {
        if (loadingMoreEvents || loading || !activityState.hasMore) return
        setLoadingMoreEvents(true)
        try {
            const result = await api.actRuntime.events(actId, threadId, ACTIVITY_PAGE_SIZE, activityState.nextBefore)
            const pageEvents = (result.events || [])
                .map((event, index) => toActivityEvent(event, index + activityState.nextBefore))
                .filter((event): event is ActivityEvent => event !== null)

            setActivityState((prev) => {
                const merged = mergeActivityPages(prev.events, pageEvents, 'appendOlder')
                const total = typeof result.total === 'number' ? result.total : merged.length
                return {
                    events: merged,
                    hasMore: merged.length < total,
                    nextBefore: merged.length,
                }
            })
        } catch (err) {
            console.error('[ActBoardView] Failed to load more events', err)
        } finally {
            setLoadingMoreEvents(false)
        }
    }, [actId, activityState.hasMore, activityState.nextBefore, loading, loadingMoreEvents, threadId])

    useEffect(() => { loadData() }, [loadData])

    // Auto-refresh every 5 seconds
    useEffect(() => {
        const interval = setInterval(loadData, 5000)
        return () => clearInterval(interval)
    }, [loadData])

    const filteredEntries = useMemo(
        () => filterBoardEntries(entries, filter),
        [entries, filter],
    )

    const kindCounts = useMemo(() => getBoardKindCounts(entries), [entries])
    const events = activityState.events

    const toggleExpand = useCallback((key: string) => {
        const shouldExpand = !expandedKeys.has(key)
        setExpandedKeys((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })

        if (!shouldExpand || fullEntryKeysRef.current.has(key)) return

        setLoadingExpandedKeys((prev) => {
            const next = new Set(prev)
            next.add(key)
            return next
        })

        void api.actRuntime.readBoard(actId, threadId, key)
            .then((result) => {
                const fullEntry = (result.entries || [])
                    .map(toBoardEntry)
                    .find((entry): entry is BoardEntry => entry !== null && entry.key === key)
                if (!fullEntry) return
                fullEntryKeysRef.current.add(key)
                setEntries((prev) => prev.map((entry) => (
                    entry.key === key
                        ? { ...entry, ...fullEntry, content: fullEntry.content }
                        : entry
                )))
            })
            .catch((err) => {
                console.error('[ActBoardView] Failed to load full board entry', err)
            })
            .finally(() => {
                setLoadingExpandedKeys((prev) => {
                    const next = new Set(prev)
                    next.delete(key)
                    return next
                })
            })
    }, [actId, expandedKeys, threadId])

    const handleActivityScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        if (loadingMoreEvents || loading || !activityState.hasMore) return
        const element = event.currentTarget
        const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
        if (remaining <= 48) {
            void loadMoreEvents()
        }
    }, [activityState.hasMore, loadMoreEvents, loading, loadingMoreEvents])

    useEffect(() => {
        if (loadingMoreEvents || loading || !activityState.hasMore || activityState.events.length === 0) return
        const element = activityListRef.current
        if (!element) return
        if (element.scrollHeight <= element.clientHeight + 8) {
            void loadMoreEvents()
        }
    }, [activityState.events.length, activityState.hasMore, loadMoreEvents, loading, loadingMoreEvents])

    return (
        <div className="act-board">
            <div className="act-board__header">
                <div className="act-board__tabs" role="tablist" aria-label="Board filters">
                    {FILTER_KINDS.map((kind) => (
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

            <div className="act-board__body">
                <div className="act-board__main">
                    {filteredEntries.length === 0 ? (
                        <div className="act-board__empty">
                            <Clipboard size={20} className="act-board__empty-icon" />
                            <span>
                                {entries.length === 0
                                    ? 'No shared board yet'
                                    : `No ${KIND_LABELS[filter].toLowerCase()} found`}
                            </span>
                        </div>
                    ) : (
                        <div className="act-board__cards scroll-area">
                            {filteredEntries.map((entry) => {
                                const isExpanded = expandedKeys.has(entry.key)
                                const isLoadingExpanded = loadingExpandedKeys.has(entry.key)
                                const isLong = entry.content.length > 220 || entry.content.split('\n').length > 6

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
                                            <span className="act-board__card-author">
                                                {resolveBoardActorLabel(act, performers, entry.author)}
                                            </span>
                                        </div>
                                        <div
                                            className={`act-board__card-content ${isExpanded ? 'act-board__card-content--expanded' : ''}`}
                                        >
                                            <MarkdownRenderer content={entry.content} showThinking={false} />
                                        </div>
                                        {isLong && (
                                            <button
                                                className="act-board__expand-btn"
                                                onClick={() => toggleExpand(entry.key)}
                                                disabled={isLoadingExpanded}
                                            >
                                                {isLoadingExpanded
                                                    ? 'Loading...'
                                                    : isExpanded
                                                        ? 'Show less'
                                                        : 'Show more'}
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
                </div>

                <aside className="act-board__activity-column">
                    <div className="act-board__activity">
                        <div className="act-board__activity-header">
                            <Activity size={9} />
                            <span>Recent Activity</span>
                        </div>
                        {events.length > 0 ? (
                            <div
                                ref={activityListRef}
                                className="act-board__activity-list scroll-area"
                                onScroll={handleActivityScroll}
                            >
                                {events.map((event) => (
                                    <div key={event.id} className="act-board__activity-item">
                                        <span className="act-board__activity-icon">
                                            {getEventIcon(event.type)}
                                        </span>
                                        <span className="act-board__activity-copy">
                                            {getEventDescription(event, act, performers)}
                                        </span>
                                        <span className="act-board__activity-time">
                                            {relativeTime(event.timestamp)}
                                        </span>
                                    </div>
                                ))}
                                {loadingMoreEvents && (
                                    <div className="act-board__activity-status">
                                        Loading more activity...
                                    </div>
                                )}
                                {!loadingMoreEvents && activityState.hasMore && (
                                    <div className="act-board__activity-status">
                                        Scroll for more
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="act-board__activity-empty">
                                <Activity size={14} className="act-board__empty-icon" />
                                <span>No recent activity yet</span>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    )
}
