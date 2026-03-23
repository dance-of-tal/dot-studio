import { useState } from 'react'
import {
    Archive,
    ChevronRight,
    Eye,
    EyeOff,
    Plus,
    Trash2,
    Workflow,
} from 'lucide-react'
import { showToast } from '../../lib/toast'
import type { WorkspaceExplorerAct, WorkspaceExplorerActThread } from './workspace-explorer-types'

type Props = {
    act: WorkspaceExplorerAct
    selectedActId: string | null
    activeThreadId: string | null
    threads: WorkspaceExplorerActThread[]
    expanded: boolean
    onToggleExpanded: (key: string) => void
    onOpenAct: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>

    onSaveActAsDraft: (id: string) => void
    onToggleActVisibility: (id: string) => void
    onRemoveAct: (id: string) => void
    onSelectThread: (threadId: string) => void
}

export default function WorkspaceExplorerActGroup({
    act,
    selectedActId,
    activeThreadId,
    threads,
    expanded,
    onToggleExpanded,
    onOpenAct,
    onCreateThread,

    onSaveActAsDraft,
    onToggleActVisibility,
    onRemoveAct,
    onSelectThread,
}: Props) {
    const actKey = `act-${act.id}`
    const isActSelected = selectedActId === act.id
    const participantCount = Object.keys(act.participants).length
    const [showAllThreads, setShowAllThreads] = useState(false)
    const THREAD_LIMIT = 5
    const visibleThreads = showAllThreads ? threads : threads.slice(0, THREAD_LIMIT)
    const hiddenThreadCount = threads.length - THREAD_LIMIT

    return (
        <div className="thread-group">
            <div
                role="button"
                tabIndex={0}
                className={[
                    'thread-card',
                    isActSelected ? 'active' : '',
                    act.hidden ? 'thread-card--hidden' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onOpenAct(act.id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenAct(act.id)
                    }
                }}
            >
                <span
                    className={`thread-card__chevron ${expanded ? 'is-open' : ''}`}
                    onClick={(event) => {
                        event.stopPropagation()
                        onToggleExpanded(actKey)
                    }}
                >
                    <ChevronRight size={12} />
                </span>
                <span className="thread-card__icon">
                    <Workflow size={13} />
                </span>
                <span className="thread-card__body">
                    <span className="thread-card__name">{act.name}</span>
                    <span className="thread-card__meta">
                        {participantCount}p · {act.relations.length}r · {threads.length}t
                    </span>
                </span>
                <span className="thread-card__actions" onClick={(event) => event.stopPropagation()}>
                    <button className="icon-btn" onClick={() => void onCreateThread(act.id)} title="New Thread">
                        <Plus size={11} />
                    </button>

                    <button
                        className="icon-btn"
                        onClick={() => {
                            onSaveActAsDraft(act.id)
                            showToast(`Saved "${act.name}" as draft`, 'success', {
                                title: 'Draft saved',
                                dedupeKey: `draft:save:act:${act.id}`,
                            })
                        }}
                        title="Save act as draft"
                    >
                        <Archive size={11} />
                    </button>
                    <button
                        className={`icon-btn ${act.hidden ? 'icon-btn--active' : ''}`}
                        onClick={() => onToggleActVisibility(act.id)}
                        title={act.hidden ? 'Show on canvas' : 'Hide from canvas'}
                    >
                        {act.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                    <button className="icon-btn remove-btn" onClick={() => onRemoveAct(act.id)} title="Delete act">
                        <Trash2 size={11} />
                    </button>
                </span>
            </div>
            {expanded ? (
                <div className="thread-children">
                    {threads.length > 0 ? (
                        <>
                            {visibleThreads.map((thread) => {
                                const isThreadActive = activeThreadId === thread.id
                                const statusIcon = thread.status === 'active' ? '●' : thread.status === 'completed' ? '✓' : '⏸'
                                const statusClass = `thread-status--${thread.status || 'idle'}`
                                return (
                                    <div
                                        key={thread.id}
                                        role="button"
                                        tabIndex={0}
                                        className={`layer-row ${isThreadActive ? 'active' : ''}`}
                                        onClick={() => {
                                            onSelectThread(thread.id)
                                            onOpenAct(act.id)
                                        }}
                                    >
                                        <span className="layer-row__icon">
                                            <Workflow size={11} />
                                        </span>
                                        <span className="layer-row__body">
                                            <span className="layer-row__label">
                                                <span className="thread-label">
                                                    <span className={`thread-status-dot ${statusClass}`}>{statusIcon}</span>
                                                    Thread {thread.id.slice(0, 6)}
                                                </span>
                                            </span>
                                            <span className="layer-row__meta">
                                                {new Date(thread.createdAt).toLocaleTimeString()}
                                            </span>
                                        </span>
                                    </div>
                                )
                            })}
                            {hiddenThreadCount > 0 ? (
                                <button
                                    className="show-more-btn"
                                    onClick={(e) => { e.stopPropagation(); setShowAllThreads(!showAllThreads) }}
                                    type="button"
                                >
                                    {showAllThreads ? 'Show less' : `Show ${hiddenThreadCount} more`}
                                </button>
                            ) : null}
                        </>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No threads — click + to create one
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
