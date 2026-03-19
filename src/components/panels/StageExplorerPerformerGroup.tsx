import {
    Archive,
    Check,
    ChevronRight,
    Eye,
    EyeOff,
    MessageSquare,
    Pencil,
    Trash2,
    X,
} from 'lucide-react'
import { showToast } from '../../lib/toast'
import {
    LayerRow,
    SessionNameEditor,
    SessionRowActions,
    type ExplorerRenamingSession,
    type ThreadRow,
} from './stage-explorer-utils'

type Props = {
    row: ThreadRow
    expanded: boolean
    pendingDelete: string | null
    renamingSession: ExplorerRenamingSession
    editingTarget: any
    onToggleExpanded: () => void
    onSetPendingDelete: (key: string | null) => void
    onBeginRenamePerformerSession: (session: { id: string; title?: string }) => void
    onCommitRenameSession: () => void | Promise<void>
    onCancelRenameSession: () => void
    onSetRenamingValue: (value: string) => void
    performerSessionLabel: (session: { id: string; title?: string }) => string
    onOpenPerformer: (performerId: string) => void
    onOpenPerformerSession: (performerId: string, session: { id: string; title?: string }) => void | Promise<void>
    onDeleteSession: (id: string) => void
    onTogglePerformerVisibility: (id: string) => void
    onOpenPerformerEditor: (id: string, focus: any) => void
    onSetActiveChatPerformer: (id: string | null) => void
    onRemovePerformer: (id: string) => void
    onSavePerformerAsDraft: (id: string) => void
}

export default function StageExplorerPerformerGroup({
    row,
    expanded,
    pendingDelete,
    renamingSession,
    editingTarget,
    onToggleExpanded,
    onSetPendingDelete,
    onBeginRenamePerformerSession,
    onCommitRenameSession,
    onCancelRenameSession,
    onSetRenamingValue,
    performerSessionLabel,
    onOpenPerformer,
    onOpenPerformerSession,
    onDeleteSession,
    onTogglePerformerVisibility,
    onOpenPerformerEditor,
    onSetActiveChatPerformer,
    onRemovePerformer,
    onSavePerformerAsDraft,
}: Props) {
    const rowKey = `performer-${row.id}`

    return (
        <div className="thread-group">
            <div
                role="button"
                tabIndex={0}
                className={[
                    'thread-card',
                    row.active ? 'active' : '',
                    row.hidden ? 'muted' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onOpenPerformer(row.id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenPerformer(row.id)
                    }
                }}
            >
                <span
                    className={`thread-card__chevron ${expanded ? 'is-open' : ''}`}
                    onClick={(event) => {
                        event.stopPropagation()
                        onToggleExpanded()
                    }}
                >
                    <ChevronRight size={12} />
                </span>
                <span className="thread-card__icon">
                    <MessageSquare size={13} />
                </span>
                <span className="thread-card__body">
                    <span className="thread-card__name">{row.label}</span>
                </span>
                <span className="thread-card__actions" onClick={(event) => event.stopPropagation()}>
                    {pendingDelete === rowKey ? (
                        <>
                            <span className="thread-card__delete-label">Delete?</span>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => {
                                    onSetPendingDelete(null)
                                    onRemovePerformer(row.id)
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
                                className={`icon-btn ${row.hidden ? 'visibility-off' : 'visibility-on'}`}
                                onClick={() => onTogglePerformerVisibility(row.id)}
                                title={row.hidden ? 'Show performer' : 'Hide performer'}
                            >
                                {row.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                            <button
                                className={`icon-btn ${(editingTarget?.type === 'performer' && editingTarget.id === row.id) ? 'icon-btn--active' : ''}`}
                                onClick={() => {
                                    onOpenPerformerEditor(row.id, 'performer-runtime')
                                    onSetActiveChatPerformer(row.id)
                                }}
                                title="Edit performer"
                            >
                                <Pencil size={11} />
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => {
                                    onSavePerformerAsDraft(row.id)
                                    showToast(`Saved "${row.label}" as draft`, 'success', {
                                        title: 'Draft saved',
                                        dedupeKey: `draft:save:${row.id}`,
                                    })
                                }}
                                title="Save performer as draft"
                            >
                                <Archive size={11} />
                            </button>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => onSetPendingDelete(rowKey)}
                                title="Delete performer"
                            >
                                <Trash2 size={11} />
                            </button>
                        </>
                    )}
                </span>
            </div>
            {expanded ? (
                <div className="thread-children">
                    {row.children.length > 0 ? row.children.map((entry) => (
                        <LayerRow
                            key={entry.session.id}
                            icon={<MessageSquare size={11} className={entry.active ? 'icon-active' : 'icon-muted'} />}
                            label={(
                                <SessionNameEditor
                                    renaming={renamingSession?.key === `performer:${entry.session.id}` ? renamingSession : null}
                                    display={performerSessionLabel(entry.session)}
                                    onChange={onSetRenamingValue}
                                    onCommit={() => void onCommitRenameSession()}
                                    onCancel={onCancelRenameSession}
                                />
                            )}
                            meta={entry.active ? 'Current thread' : 'Saved thread'}
                            metaTone={entry.active ? 'success' : 'default'}
                            active={false}
                            onClick={renamingSession?.key === `performer:${entry.session.id}` ? undefined : () => void onOpenPerformerSession(row.id, entry.session)}
                            actions={(
                                <SessionRowActions
                                    renaming={renamingSession?.key === `performer:${entry.session.id}` ? renamingSession : null}
                                    onCommit={() => void onCommitRenameSession()}
                                    onCancel={onCancelRenameSession}
                                    onRename={() => onBeginRenamePerformerSession(entry.session)}
                                    onDelete={() => onDeleteSession(entry.session.id)}
                                    renameTitle="Rename session"
                                    deleteTitle="Delete session"
                                />
                            )}
                        />
                    )) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No threads yet
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
