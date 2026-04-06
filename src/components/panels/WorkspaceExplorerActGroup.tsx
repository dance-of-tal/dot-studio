import { useState } from 'react'
import {
    Archive,
    Check,
    ChevronRight,
    Edit3,
    Eye,
    EyeOff,
    Pencil,
    Plus,
    Trash2,
    Workflow,
    X,
} from 'lucide-react'
import { showToast } from '../../lib/toast'
import type { WorkspaceExplorerAct, WorkspaceExplorerActThread } from './workspace-explorer-types'
import { evaluateActReadiness } from '../../features/act/act-readiness'
import { useStudioStore } from '../../store'

type Props = {
    act: WorkspaceExplorerAct
    selectedActId: string | null
    activeThreadId: string | null
    threads: WorkspaceExplorerActThread[]
    expanded: boolean
    pendingDelete: string | null
    onToggleExpanded: (key: string) => void
    onOpenAct: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>
    onSetPendingDelete: (key: string | null) => void
    onSaveActAsDraft: (id: string) => void
    onToggleActVisibility: (id: string) => void
    onRemoveAct: (id: string) => void
    onSelectThread: (actId: string, threadId: string) => void
    onDeleteThread: (actId: string, threadId: string) => void
    onRenameThread: (actId: string, threadId: string, name: string) => void
    onOpenActEditor: (actId: string) => void
}

export default function WorkspaceExplorerActGroup({
    act,
    selectedActId,
    activeThreadId,
    threads,
    expanded,
    pendingDelete,
    onToggleExpanded,
    onOpenAct,
    onCreateThread,
    onSetPendingDelete,
    onSaveActAsDraft,
    onToggleActVisibility,
    onRemoveAct,
    onSelectThread,
    onDeleteThread,
    onRenameThread,
    onOpenActEditor,
}: Props) {
    const actKey = `act-${act.id}`
    const isActSelected = selectedActId === act.id
    const participantCount = Object.keys(act.participants).length
    const [showAllThreads, setShowAllThreads] = useState(false)
    const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const THREAD_LIMIT = 5
    const visibleThreads = showAllThreads ? threads : threads.slice(0, THREAD_LIMIT)
    const hiddenThreadCount = threads.length - THREAD_LIMIT

    const performers = useStudioStore((s) => s.performers)
    const readiness = evaluateActReadiness(act, performers)
    const createThreadTitle = readiness.runnable
        ? 'New Thread'
        : readiness.issues.find((i) => i.severity === 'error')?.message || 'Act is not runnable'

    return (
        <div className="thread-group">
            <div
                role="button"
                tabIndex={0}
                className={[
                    'thread-card',
                    isActSelected ? 'active' : '',
                    act.hidden ? 'muted' : '',
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
                {/* Actions — same order as PerformerGroup: [Eye, +Thread, Archive, Trash] */}
                <span className="thread-card__actions" onClick={(event) => event.stopPropagation()}>
                    {pendingDelete === actKey ? (
                        <>
                            <span className="thread-card__delete-label">Delete?</span>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => {
                                    onSetPendingDelete(null)
                                    onRemoveAct(act.id)
                                }}
                                title="Confirm delete"
                            >
                                <Check size={11} />
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => onSetPendingDelete(null)}
                                title="Cancel delete"
                            >
                                <X size={11} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className={`icon-btn ${act.hidden ? 'visibility-off' : 'visibility-on'}`}
                                onClick={() => onToggleActVisibility(act.id)}
                                title={act.hidden ? 'Show on canvas' : 'Hide from canvas'}
                            >
                                {act.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => void onCreateThread(act.id)}
                                title={createThreadTitle}
                                disabled={!readiness.runnable}
                            >
                                <Plus size={11} />
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => onOpenActEditor(act.id)}
                                title="Edit act"
                            >
                                <Pencil size={11} />
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
                                className="icon-btn remove-btn"
                                onClick={() => onSetPendingDelete(actKey)}
                                title="Delete act"
                            >
                                <Trash2 size={11} />
                            </button>
                        </>
                    )}
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
                                        className="layer-row"
                                        onClick={() => {
                                            onSelectThread(act.id, thread.id)
                                        }}
                                    >
                                        <span className="layer-row__icon">
                                            <Workflow size={11} />
                                        </span>
                                        <span className="layer-row__body">
                                            <span className="layer-row__label">
                                                {renamingThreadId === thread.id ? (
                                                    <input
                                                        className="inline-rename-input"
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                onRenameThread(act.id, thread.id, renameValue.trim())
                                                                setRenamingThreadId(null)
                                                            } else if (e.key === 'Escape') {
                                                                setRenamingThreadId(null)
                                                            }
                                                        }}
                                                        onBlur={() => {
                                                            if (renameValue.trim()) {
                                                                onRenameThread(act.id, thread.id, renameValue.trim())
                                                            }
                                                            setRenamingThreadId(null)
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span className="thread-label">
                                                        <span className={`thread-status-dot ${statusClass}`}>{statusIcon}</span>
                                                        {thread.name || `Thread ${thread.id.slice(0, 6)}`}
                                                    </span>
                                                )}
                                            </span>
                                            <span className={`layer-row__meta layer-row__meta--${isThreadActive ? 'success' : 'default'}`}>
                                                {isThreadActive ? 'Current thread' : 'Saved thread'}
                                            </span>
                                        </span>
                                        <span className="layer-row__actions" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="icon-btn"
                                                onClick={() => {
                                                    setRenameValue(thread.name || `Thread ${thread.id.slice(0, 6)}`)
                                                    setRenamingThreadId(thread.id)
                                                }}
                                                title="Rename thread"
                                            >
                                                <Edit3 size={10} />
                                            </button>
                                            <button
                                                className="icon-btn remove-btn"
                                                onClick={() => onDeleteThread(act.id, thread.id)}
                                                title="Delete thread"
                                            >
                                                <Trash2 size={10} />
                                            </button>
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
