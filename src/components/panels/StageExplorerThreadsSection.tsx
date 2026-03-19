import { MessageSquare, Workflow } from 'lucide-react'
import type { ExplorerRenamingSession, ThreadRow } from './stage-explorer-utils'
import StageExplorerActGroup from './StageExplorerActGroup'
import StageExplorerPerformerGroup from './StageExplorerPerformerGroup'

type Props = {
    stageId: string | null
    acts: any[]
    performers: any[]
    threadRows: ThreadRow[]
    expandedRows: Record<string, boolean>
    pendingDelete: string | null
    renamingSession: ExplorerRenamingSession
    editingTarget: any
    selectedActId: string | null
    activeThreadId: string | null
    activeThreadParticipantKey: string | null
    actThreads: Record<string, any[]>
    focusedPerformerId: string | null
    onToggleExpanded: (key: string) => void
    onSetPendingDelete: (key: string | null) => void
    onBeginRenamePerformerSession: (session: { id: string; title?: string }) => void
    onCommitRenameSession: () => void | Promise<void>
    onCancelRenameSession: () => void
    onSetRenamingValue: (value: string) => void
    performerSessionLabel: (session: { id: string; title?: string }) => string
    onOpenPerformer: (performerId: string) => void
    onOpenPerformerSession: (performerId: string, session: { id: string; title?: string }) => void | Promise<void>
    onDeleteSession: (id: string) => void
    onAddPerformer: () => void
    onAddAct: () => void
    onTogglePerformerVisibility: (id: string) => void
    onOpenPerformerEditor: (id: string, focus: any) => void
    onSetActiveChatPerformer: (id: string | null) => void
    onRemovePerformer: (id: string) => void
    onSavePerformerAsDraft: (id: string) => void
    onSwitchFocusTarget: (id: string, type: 'performer' | 'act') => void
    onSelectAct: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>
    onEnterActLayoutMode: (id: string) => void
    onSaveActAsDraft: (id: string) => void
    onToggleActVisibility: (id: string) => void
    onRemoveAct: (id: string) => void
    onSelectThread: (threadId: string) => void
    onSelectThreadParticipant: (participantKey: string | null) => void
}

export default function StageExplorerThreadsSection({
    stageId,
    acts,
    performers,
    threadRows,
    expandedRows,
    pendingDelete,
    renamingSession,
    editingTarget,
    selectedActId,
    activeThreadId,
    activeThreadParticipantKey,
    actThreads,
    focusedPerformerId,
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
    onAddPerformer,
    onAddAct,
    onTogglePerformerVisibility,
    onOpenPerformerEditor,
    onSetActiveChatPerformer,
    onRemovePerformer,
    onSavePerformerAsDraft,
    onSwitchFocusTarget,
    onSelectAct,
    onCreateThread,
    onEnterActLayoutMode,
    onSaveActAsDraft,
    onToggleActVisibility,
    onRemoveAct,
    onSelectThread,
    onSelectThreadParticipant,
}: Props) {
    return (
        <section className="explorer-section explorer-section--threads">
            <div className="explorer__subheader">
                <span className="explorer__title">Threads</span>
                <div className="explorer__actions">
                    <button className="icon-btn" onClick={onAddPerformer} title="Add performer" disabled={!stageId}>
                        <MessageSquare size={12} />
                    </button>
                    <button className="icon-btn" onClick={onAddAct} title="Add Act" disabled={!stageId}>
                        <Workflow size={12} />
                    </button>
                </div>
            </div>
            <div className="explorer__tree scroll-area">
                {(threadRows.length > 0 || acts.length > 0) ? (
                    <>
                        {threadRows.map((row) => {
                            const rowKey = `performer-${row.id}`
                            return (
                                <StageExplorerPerformerGroup
                                    key={rowKey}
                                    row={row}
                                    expanded={expandedRows[rowKey] ?? false}
                                    pendingDelete={pendingDelete}
                                    renamingSession={renamingSession}
                                    editingTarget={editingTarget}
                                    onToggleExpanded={() => onToggleExpanded(rowKey)}
                                    onSetPendingDelete={onSetPendingDelete}
                                    onBeginRenamePerformerSession={onBeginRenamePerformerSession}
                                    onCommitRenameSession={onCommitRenameSession}
                                    onCancelRenameSession={onCancelRenameSession}
                                    onSetRenamingValue={onSetRenamingValue}
                                    performerSessionLabel={performerSessionLabel}
                                    onOpenPerformer={onOpenPerformer}
                                    onOpenPerformerSession={onOpenPerformerSession}
                                    onDeleteSession={onDeleteSession}
                                    onTogglePerformerVisibility={onTogglePerformerVisibility}
                                    onOpenPerformerEditor={onOpenPerformerEditor}
                                    onSetActiveChatPerformer={onSetActiveChatPerformer}
                                    onRemovePerformer={onRemovePerformer}
                                    onSavePerformerAsDraft={onSavePerformerAsDraft}
                                />
                            )
                        })}
                        {acts.map((act) => {
                            const actKey = `act-${act.id}`
                            return (
                                <StageExplorerActGroup
                                    key={actKey}
                                    act={act}
                                    performers={performers}
                                    selectedActId={selectedActId}
                                    activeThreadId={activeThreadId}
                                    activeThreadParticipantKey={activeThreadParticipantKey}
                                    threads={actThreads[act.id] || []}
                                    expanded={expandedRows[actKey] ?? false}
                                    expandedRows={expandedRows}
                                    focusedPerformerId={focusedPerformerId}
                                    onToggleExpanded={onToggleExpanded}
                                    onSwitchFocusTarget={onSwitchFocusTarget}
                                    onSelectAct={onSelectAct}
                                    onCreateThread={onCreateThread}
                                    onEnterActLayoutMode={onEnterActLayoutMode}
                                    onSaveActAsDraft={onSaveActAsDraft}
                                    onToggleActVisibility={onToggleActVisibility}
                                    onRemoveAct={onRemoveAct}
                                    onSelectThread={onSelectThread}
                                    onSelectThreadParticipant={onSelectThreadParticipant}
                                />
                            )
                        })}
                    </>
                ) : (
                    <div className="empty-state">
                        Add a performer to start building this stage.
                    </div>
                )}
            </div>
        </section>
    )
}
