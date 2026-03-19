import {
    Activity,
    Archive,
    ChevronRight,
    Eye,
    EyeOff,
    Plus,
    Trash2,
    User,
    Workflow,
} from 'lucide-react'
import { showToast } from '../../lib/toast'
import { resolveActParticipantLabel } from '../../features/act/participant-labels'
import { LayerRow } from './stage-explorer-utils'

type Props = {
    act: any
    performers: any[]
    selectedActId: string | null
    activeThreadId: string | null
    activeThreadParticipantKey: string | null
    threads: any[]
    expanded: boolean
    expandedRows: Record<string, boolean>
    focusedPerformerId: string | null
    onToggleExpanded: (key: string) => void
    onSwitchFocusTarget: (id: string, type: 'performer' | 'act') => void
    onSelectAct: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>

    onSaveActAsDraft: (id: string) => void
    onToggleActVisibility: (id: string) => void
    onRemoveAct: (id: string) => void
    onSelectThread: (threadId: string) => void
    onSelectThreadParticipant: (participantKey: string | null) => void
}

export default function StageExplorerActGroup({
    act,
    performers,
    selectedActId,
    activeThreadId,
    activeThreadParticipantKey,
    threads,
    expanded,
    expandedRows,
    focusedPerformerId,
    onToggleExpanded,
    onSwitchFocusTarget,
    onSelectAct,
    onCreateThread,

    onSaveActAsDraft,
    onToggleActVisibility,
    onRemoveAct,
    onSelectThread,
    onSelectThreadParticipant,
}: Props) {
    const actKey = `act-${act.id}`
    const isActSelected = selectedActId === act.id
    const participantCount = Object.keys(act.participants).length

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
                onClick={() => {
                    if (focusedPerformerId && focusedPerformerId !== act.id) {
                        onSwitchFocusTarget(act.id, 'act')
                    }
                    onSelectAct(act.id)
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        if (focusedPerformerId && focusedPerformerId !== act.id) {
                            onSwitchFocusTarget(act.id, 'act')
                        }
                        onSelectAct(act.id)
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
                    {threads.length > 0 ? threads.map((thread) => {
                        const isThreadActive = activeThreadId === thread.id
                        const statusIcon = thread.status === 'active' ? '●' : thread.status === 'completed' ? '✓' : '⏸'
                        const statusClass = `thread-status--${thread.status || 'idle'}`
                        const threadKey = `thread-${thread.id}`
                        const threadExpanded = expandedRows[threadKey] ?? false
                        const boundParticipantKeys = Object.keys(act.participants)
                        return (
                            <div key={thread.id} className="thread-group">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`layer-row ${isThreadActive ? 'active' : ''}`}
                                    onClick={() => {
                                        onSelectThread(thread.id)
                                        onSelectAct(act.id)
                                    }}
                                >
                                    {boundParticipantKeys.length > 0 ? (
                                        <span
                                            className={`thread-card__chevron ${threadExpanded ? 'is-open' : ''}`}
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                onToggleExpanded(threadKey)
                                            }}
                                        >
                                            <ChevronRight size={10} />
                                        </span>
                                    ) : (
                                        <span className="thread-card__chevron-spacer" style={{ width: 10 }} />
                                    )}
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
                                {threadExpanded ? (
                                    <div className="thread-children">
                                        <LayerRow
                                            icon={<Activity size={10} />}
                                            label="Callboard / Activity"
                                            active={isThreadActive && !activeThreadParticipantKey}
                                            onClick={() => {
                                                onSelectThread(thread.id)
                                                onSelectThreadParticipant(null)
                                                onSelectAct(act.id)
                                            }}
                                        />
                                        {boundParticipantKeys.map((participantKey) => (
                                            <LayerRow
                                                key={participantKey}
                                                icon={<User size={10} />}
                                                label={resolveActParticipantLabel(act, participantKey, performers)}
                                                active={isThreadActive && activeThreadParticipantKey === participantKey}
                                                onClick={() => {
                                                    onSelectThread(thread.id)
                                                    onSelectThreadParticipant(participantKey)
                                                    onSelectAct(act.id)
                                                }}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )
                    }) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No threads — click + to create one
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
