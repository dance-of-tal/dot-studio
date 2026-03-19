import { useCallback, useRef, useState } from 'react'
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
    onOpenAct: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>

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
    onOpenAct,
    onCreateThread,

    onSaveActAsDraft,
    onToggleActVisibility,
    onRemoveAct,
    onSelectThread,
    onSelectThreadParticipant,
}: Props) {
    const hasPerformers = threadRows.length > 0
    const hasActs = acts.length > 0

    // ── Resizable divider between Performers and Acts ──
    const [performersFlex, setPerformersFlex] = useState(1)
    const containerRef = useRef<HTMLDivElement>(null)
    const dividerDragging = useRef(false)

    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        dividerDragging.current = true
        const container = containerRef.current
        if (!container) return

        const startY = e.clientY
        const containerRect = container.getBoundingClientRect()
        const totalHeight = containerRect.height
        const startFlex = performersFlex

        const onMove = (ev: MouseEvent) => {
            if (!dividerDragging.current) return
            const delta = ev.clientY - startY
            const ratio = delta / totalHeight
            // Flex range: 0.15 to 0.85 (each side gets at least 15% of the space)
            setPerformersFlex(Math.min(5, Math.max(0.2, startFlex + ratio * 2)))
        }
        const onUp = () => {
            dividerDragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }, [performersFlex])

    return (
        <section className="explorer-section explorer-section--threads" ref={containerRef}>
            {/* ── Performers Pane ── */}
            <div className="explorer__pane" style={{ flex: performersFlex }}>
                <div className="explorer__subheader explorer__subheader--inline">
                    <span className="explorer__title">Performers</span>
                    <div className="explorer__actions">
                        <button className="icon-btn" onClick={onAddPerformer} title="Add performer" disabled={!stageId}>
                            <MessageSquare size={12} />
                        </button>
                    </div>
                </div>
                <div className="explorer__pane-scroll scroll-area">
                    {hasPerformers ? (
                        <div className="explorer__section-list">
                            {threadRows.map((row) => {
                                const rowKey = `performer-${row.id}`
                                const isExpanded = expandedRows[rowKey] ?? row.children.length > 0
                                return (
                                    <StageExplorerPerformerGroup
                                        key={rowKey}
                                        row={row}
                                        expanded={isExpanded}
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
                        </div>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No performers yet
                        </div>
                    )}
                </div>
            </div>

            {/* ── Divider ── */}
            <div className="explorer__divider" onMouseDown={onDividerMouseDown} />

            {/* ── Acts Pane ── */}
            <div className="explorer__pane" style={{ flex: 1 }}>
                <div className="explorer__subheader explorer__subheader--inline">
                    <span className="explorer__title">Acts</span>
                    <div className="explorer__actions">
                        <button className="icon-btn" onClick={onAddAct} title="Add Act" disabled={!stageId}>
                            <Workflow size={12} />
                        </button>
                    </div>
                </div>
                <div className="explorer__pane-scroll scroll-area">
                    {hasActs ? (
                        <div className="explorer__section-list">
                            {acts.map((act) => {
                                const actKey = `act-${act.id}`
                                const threads = actThreads[act.id] || []
                                const isExpanded = expandedRows[actKey] ?? threads.length > 0
                                return (
                                    <StageExplorerActGroup
                                        key={actKey}
                                        act={act}
                                        performers={performers}
                                        selectedActId={selectedActId}
                                        activeThreadId={activeThreadId}
                                                activeThreadParticipantKey={activeThreadParticipantKey}
                                                threads={threads}
                                                expanded={isExpanded}
                                                expandedRows={expandedRows}
                                                onToggleExpanded={onToggleExpanded}
                                                onOpenAct={onOpenAct}
                                                onCreateThread={onCreateThread}

                                        onSaveActAsDraft={onSaveActAsDraft}
                                        onToggleActVisibility={onToggleActVisibility}
                                        onRemoveAct={onRemoveAct}
                                        onSelectThread={onSelectThread}
                                        onSelectThreadParticipant={onSelectThreadParticipant}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No acts yet — connect performers to create one
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
