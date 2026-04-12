import { useCallback, useRef, useState } from 'react'
import { MessageSquare, Workflow } from 'lucide-react'
import type { ExplorerRenamingSession, ThreadRow } from './workspace-explorer-utils'
import { resolveActThreadActivityAt, resolveSessionActivityAt } from './workspace-explorer-utils'
import type { PerformerEditorFocus, WorkspaceExplorerAct, WorkspaceExplorerActThread, WorkspaceExplorerEditingTarget } from './workspace-explorer-types'
import type { ChatMessage } from '../../types'
import type { SessionEntity } from '../../store/session'
import WorkspaceExplorerActGroup from './WorkspaceExplorerActGroup'
import WorkspaceExplorerPerformerGroup from './WorkspaceExplorerPerformerGroup'

type Props = {
    workspaceId: string | null
    acts: WorkspaceExplorerAct[]
    threadRows: ThreadRow[]
    expandedRows: Record<string, boolean>
    pendingDelete: string | null
    renamingSession: ExplorerRenamingSession
    editingTarget: WorkspaceExplorerEditingTarget
    selectedActId: string | null
    activeThreadId: string | null
    actThreads: Record<string, WorkspaceExplorerActThread[]>
    sessions: Array<{ id: string; title?: string; sidebarTitle?: string; createdAt?: number; updatedAt?: number }>
    seEntities: Record<string, SessionEntity>
    seMessages: Record<string, ChatMessage[]>
    onToggleExpanded: (key: string) => void
    onSetPendingDelete: (key: string | null) => void
    onBeginRenamePerformerSession: (session: { id: string; title?: string; sidebarTitle?: string }) => void
    onCommitRenameSession: () => void | Promise<void>
    onCancelRenameSession: () => void
    onSetRenamingValue: (value: string) => void
    performerSessionLabel: (session: { id: string; title?: string; sidebarTitle?: string }) => string
    onOpenPerformer: (performerId: string) => void
    onOpenPerformerSession: (performerId: string, session: { id: string; title?: string; sidebarTitle?: string }) => void | Promise<void>
    onDeleteSession: (id: string) => void
    onAddPerformer: () => void
    onAddAct: () => void
    onTogglePerformerVisibility: (id: string) => void
    onOpenPerformerEditor: (id: string, focus: PerformerEditorFocus) => void
    onSetActiveChatPerformer: (id: string | null) => void
    onRemovePerformer: (id: string) => void
    onSavePerformerAsDraft: (id: string) => void
    onOpenAct: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>

    onSaveActAsDraft: (id: string) => void
    onToggleActVisibility: (id: string) => void
    onRemoveAct: (id: string) => void
    onSelectThread: (actId: string, threadId: string) => void
    onDeleteThread: (actId: string, threadId: string) => void
    onRenameThread: (actId: string, threadId: string, name: string) => void
    onStartNewSession: (performerId: string) => void
    onOpenActEditor: (actId: string) => void
}

export default function WorkspaceExplorerThreadsSection({
    workspaceId,
    acts,
    threadRows,
    expandedRows,
    pendingDelete,
    renamingSession,
    editingTarget,
    selectedActId,
    activeThreadId,
    actThreads,
    sessions,
    seEntities,
    seMessages,
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
    onDeleteThread,
    onRenameThread,
    onStartNewSession,
    onOpenActEditor,
}: Props) {
    const hasPerformers = threadRows.length > 0
    const hasActs = acts.length > 0
    const sessionActivityById = Object.fromEntries(
        sessions.map((session) => {
            const entity = seEntities[session.id]
            const latestMessageTimestamp = (seMessages[session.id] || []).reduce(
                (latest, message) => Math.max(latest, message.timestamp || 0),
                0,
            )
            return [session.id, resolveSessionActivityAt({
                createdAt: Math.max(session.createdAt || 0, entity?.createdAt || 0),
                updatedAt: Math.max(session.updatedAt || 0, entity?.updatedAt || 0),
            }, latestMessageTimestamp)]
        }),
    )

    // ── Resizable divider between Performers and Acts ──
    const [performersFlex, setPerformersFlex] = useState(1)
    const containerRef = useRef<HTMLDivElement>(null)
    const dividerDragging = useRef(false)

    const suppressNextClick = useCallback(() => {
        const handleClickCapture = (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            document.removeEventListener('click', handleClickCapture, true)
        }

        document.addEventListener('click', handleClickCapture, true)
        window.setTimeout(() => {
            document.removeEventListener('click', handleClickCapture, true)
        }, 0)
    }, [])

    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
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
        const onUp = (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            dividerDragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            suppressNextClick()
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }, [performersFlex, suppressNextClick])

    return (
        <section className="explorer-section explorer-section--threads" ref={containerRef}>
            {/* ── Performers Pane ── */}
            <div className="explorer__pane" style={{ flex: performersFlex }}>
                <div className="explorer__subheader explorer__subheader--inline">
                    <span className="explorer__title">Performers</span>
                    <div className="explorer__actions">
                        <button className="icon-btn" onClick={onAddPerformer} title="Add performer" disabled={!workspaceId}>
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
                                    <WorkspaceExplorerPerformerGroup
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
                                        onStartNewSession={onStartNewSession}
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
                        <button className="icon-btn" onClick={onAddAct} title="Add Act" disabled={!workspaceId}>
                            <Workflow size={12} />
                        </button>
                    </div>
                </div>
                <div className="explorer__pane-scroll scroll-area">
                    {hasActs ? (
                        <div className="explorer__section-list">
                            {acts.map((act) => {
                                const actKey = `act-${act.id}`
                                const threads = [...(actThreads[act.id] || [])].sort(
                                    (left, right) => (
                                        resolveActThreadActivityAt(right, sessionActivityById)
                                        - resolveActThreadActivityAt(left, sessionActivityById)
                                    ) || ((right.createdAt || 0) - (left.createdAt || 0)),
                                )
                                const isExpanded = expandedRows[actKey] ?? threads.length > 0
                                return (
                                    <WorkspaceExplorerActGroup
                                        key={actKey}
                                        act={act}
                                        selectedActId={selectedActId}
                                        activeThreadId={activeThreadId}
                                        threads={threads}
                                        expanded={isExpanded}
                                        pendingDelete={pendingDelete}
                                        onToggleExpanded={onToggleExpanded}
                                        onOpenAct={onOpenAct}
                                        onCreateThread={onCreateThread}
                                        onSetPendingDelete={onSetPendingDelete}
                                        onSaveActAsDraft={onSaveActAsDraft}
                                        onToggleActVisibility={onToggleActVisibility}
                                        onRemoveAct={onRemoveAct}
                                        onSelectThread={onSelectThread}
                                        onDeleteThread={onDeleteThread}
                                        onRenameThread={onRenameThread}
                                        onOpenActEditor={onOpenActEditor}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No acts yet
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
