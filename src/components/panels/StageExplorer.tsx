import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { useStudioStore } from '../../store';
import { mapSessionMessagesToChatMessages } from '../../lib/chat-messages';
import { parseStudioSessionTitle, renameStudioSessionTitle } from '../../../shared/session-metadata';
import {
    Archive,
    Check,
    ChevronRight,
    Eye,
    EyeOff,
    Folder,
    MessageSquare,
    Pencil,
    Plus,
    Trash2,
    User,
    X,
    Workflow,
    Activity,
} from 'lucide-react';
import './StageExplorer.css';
import {
    stageLabel,
    buildPerformerSessionRows,
    groupPerformerSessionsById,
    buildThreadRows,
    LayerRow,
    SessionNameEditor,
    SessionRowActions,
} from './stage-explorer-utils';
import type { ExplorerRenamingSession } from './stage-explorer-utils';
import { resolveActParticipantLabel } from '../../features/act/participant-labels';


export default function StageExplorer() {
    const [stagesHeight, setStagesHeight] = useState(190);
    const dividerDragging = useRef(false);

    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dividerDragging.current = true;
        const startY = e.clientY;
        const startH = stagesHeight;

        const onMove = (ev: MouseEvent) => {
            if (!dividerDragging.current) return;
            const delta = ev.clientY - startY;
            setStagesHeight(Math.min(400, Math.max(80, startH + delta)));
        };
        const onUp = () => {
            dividerDragging.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }, [stagesHeight]);
    const {
        stageId,
        workingDir,
        stageList,
        performers,
        sessions,
        sessionMap,
        editingTarget,
        selectedPerformerId,
        selectedPerformerSessionId,
        newStage,
        loadStage,
        listStages,
        listSessions,
        deleteStage,
        addPerformer,
        selectPerformer,
        selectPerformerSession,
        setActiveChatPerformer,
        openPerformerEditor,
        closeEditor,
        deleteSession,
        togglePerformerVisibility,
        removePerformer,
        savePerformerAsDraft,
        saveActAsDraft,
    } = useStudioStore();

    const acts = useStudioStore((s) => s.acts);
    const selectedActId = useStudioStore((s) => s.selectedActId);
    const selectAct = useStudioStore((s) => s.selectAct);
    const removeAct = useStudioStore((s) => s.removeAct);
    const enterActLayoutMode = useStudioStore((s) => s.enterActLayoutMode);
    const toggleActVisibility = useStudioStore((s) => s.toggleActVisibility);
    const actThreads = useStudioStore((s) => s.actThreads);
    const activeThreadId = useStudioStore((s) => s.activeThreadId);
    const activeThreadParticipantKey = useStudioStore((s) => s.activeThreadParticipantKey);
    const createThread = useStudioStore((s) => s.createThread);
    const selectThread = useStudioStore((s) => s.selectThread);
    const selectThreadParticipant = useStudioStore((s) => s.selectThreadParticipant);

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [renamingSession, setRenamingSession] = useState<ExplorerRenamingSession>(null);

    useEffect(() => {
        listStages();
        listSessions();
    }, [listSessions, listStages, workingDir]);

    const sharedPerformers = useMemo(
        () => performers.filter((performer) => performer.scope === 'shared' && performer.id !== 'studio-assistant'),
        [performers],
    );

    const performerSessionRows = useMemo(() => {
        return buildPerformerSessionRows(sessions, performers, sessionMap);
    }, [performers, sessionMap, sessions]);

    const performerSessionsById = useMemo(() => {
        return groupPerformerSessionsById(performerSessionRows);
    }, [performerSessionRows]);

    const threadRows = useMemo(() => {
        return buildThreadRows({
            sharedPerformers,
            editingTarget: editingTarget?.type === 'performer' ? editingTarget as { type: 'performer'; id: string } : null,
            performerSessionsById,
            selectedPerformerId,
            selectedPerformerSessionId,
        });
    }, [editingTarget, performerSessionsById, selectedPerformerId, selectedPerformerSessionId, sharedPerformers]);

    const stageRows = stageList.map((entry) => {
        const segments = entry.workingDir.trim().replace(/\/+$/, '').split('/');
        const shortPath = segments.length > 2 ? `…/${segments.slice(-2).join('/')}` : entry.workingDir;
        return (
            <LayerRow
                key={entry.id}
                icon={<Folder size={12} className={entry.id === stageId ? 'icon-active' : 'icon-muted'} />}
                label={stageLabel(entry.workingDir)}
                meta={shortPath}
                active={entry.id === stageId}
                onClick={() => loadStage(entry.id)}
                actions={
                    <button
                        className="icon-btn remove-btn"
                        onClick={() => deleteStage(entry.id)}
                        title="Delete saved workspace"
                    >
                        <Trash2 size={10} />
                    </button>
                }
            />
        );
    });

    const toggleExpanded = (key: string) => {
        setExpandedRows((current) => ({
            ...current,
            [key]: !current[key],
        }));
    };

    const performerSessionLabel = useCallback((session: { id: string; title?: string }) => {
        const metadata = parseStudioSessionTitle(session.title);
        return metadata?.label || (session as any).slug || session.id.slice(0, 8);
    }, []);

    const beginRenamePerformerSession = useCallback((session: { id: string; title?: string }) => {
        setRenamingSession({
            key: `performer:${session.id}`,
            kind: 'performer',
            sessionId: session.id,
            currentTitle: session.title,
            value: performerSessionLabel(session),
        });
    }, [performerSessionLabel]);

    const cancelRenameSession = useCallback(() => {
        setRenamingSession(null);
    }, []);

    const commitRenameSession = useCallback(async () => {
        if (!renamingSession) {
            return;
        }

        const nextLabel = renamingSession.value.trim();
        if (!nextLabel) {
            cancelRenameSession();
            return;
        }

        try {
            const nextTitle = renameStudioSessionTitle(renamingSession.currentTitle, nextLabel);
            if (!nextTitle) {
                throw new Error('Studio could not preserve thread metadata while renaming this session.');
            }
            await api.chat.updateSession(renamingSession.sessionId, nextTitle);
            await listSessions();
            setRenamingSession(null);
        } catch (error) {
            console.error('Failed to rename session', error);
            showToast('Studio could not rename that thread.', 'error', {
                title: 'Thread rename failed',
                dedupeKey: `thread:rename:${renamingSession.sessionId}`,
            });
        }
    }, [cancelRenameSession, listSessions, renamingSession]);

    const focusedPerformerId = useStudioStore((s) => s.focusedPerformerId);
    const switchFocusTarget = useStudioStore((s) => s.switchFocusTarget);

    const openPerformer = (performerId: string) => {
        closeEditor();
        selectPerformerSession(null);
        // Clear existing session binding so canvas shows an empty chat
        useStudioStore.setState((state) => ({
            sessionMap: { ...state.sessionMap, [performerId]: '' },
            chats: { ...state.chats, [performerId]: [] },
        }));
        if (focusedPerformerId && focusedPerformerId !== performerId) {
            switchFocusTarget(performerId, 'performer');
        }
        selectPerformer(performerId);
        setActiveChatPerformer(performerId);
    };

    const openPerformerSession = async (performerId: string, session: { id: string; title?: string }) => {
        useStudioStore.setState((state) => ({
            sessionMap: { ...state.sessionMap, [performerId]: session.id },
        }));
        try {
            const messages = await api.chat.messages(session.id);
            useStudioStore.setState((state) => ({
                chats: {
                    ...state.chats,
                    [performerId]: mapSessionMessagesToChatMessages(messages),
                },
            }));
        } catch (error) {
            console.error('Failed to load session messages', error);
            showToast('Studio could not load messages for that thread.', 'error', {
                title: 'Thread load failed',
                dedupeKey: `thread:load:${performerId}:${session.id}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void openPerformerSession(performerId, session)
                },
            });
        }
        closeEditor();
        if (focusedPerformerId && focusedPerformerId !== performerId) {
            switchFocusTarget(performerId, 'performer');
        }
        selectPerformer(performerId);
        selectPerformerSession(session.id);
        setActiveChatPerformer(performerId);
    };

    return (
        <div className="explorer explorer--stacked">
            <section className="explorer-section explorer-section--stages" style={{ flex: `0 0 ${stagesHeight}px` }}>
                <div className="explorer__subheader">
                    <span className="explorer__title">Stages</span>
                    <button className="icon-btn" onClick={newStage} title="Open working directory">
                        <Plus size={12} />
                    </button>
                </div>
                <div className="explorer__context">
                    <span className="explorer__context-label">Current</span>
                    <strong>{workingDir ? stageLabel(workingDir) : 'No working directory'}</strong>
                    {workingDir ? (
                        <span className="explorer__context-path" title={workingDir}>
                            {workingDir}
                        </span>
                    ) : null}
                </div>
                <div className="explorer__tree scroll-area">
                    {stageRows.length > 0 ? stageRows : <div className="empty-state">No saved working directories</div>}
                </div>
            </section>

            <div className="explorer__divider" onMouseDown={onDividerMouseDown} />

            <section className="explorer-section explorer-section--threads">
                <div className="explorer__subheader">
                    <span className="explorer__title">Threads</span>
                    <div className="explorer__actions">
                        <button
                            className="icon-btn"
                            onClick={() => addPerformer(`Performer ${sharedPerformers.length + 1}`)}
                            title="Add performer"
                            disabled={!stageId}
                        >
                            <MessageSquare size={12} />
                        </button>
                        <button
                            className="icon-btn"
                            onClick={() => useStudioStore.getState().addAct(`Act ${acts.length + 1}`)}
                            title="Add Act"
                            disabled={!stageId}
                        >
                            <Workflow size={12} />
                        </button>
                    </div>
                </div>
                <div className="explorer__tree scroll-area">
                    {(threadRows.length > 0 || acts.length > 0) ? <>{threadRows.map((row) => {
                        const rowKey = `performer-${row.id}`;
                        const expanded = expandedRows[rowKey] ?? false;

                        return (
                            <div key={rowKey} className="thread-group">
                                {/* ── Thread Row ── */}
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={[
                                        'thread-card',
                                        row.active ? 'active' : '',
                                        row.hidden ? 'muted' : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => openPerformer(row.id)}
                                    onKeyDown={(event) => {
                                        if ((event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault();
                                            openPerformer(row.id);
                                        }
                                    }}
                                >
                                    {/* Toggle chevron */}
                                    <span
                                        className={`thread-card__chevron ${expanded ? 'is-open' : ''}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            toggleExpanded(rowKey);
                                        }}
                                    >
                                        <ChevronRight size={12} />
                                    </span>

                                    {/* Type icon */}
                                    <span className="thread-card__icon">
                                        <MessageSquare size={13} />
                                    </span>

                                    {/* Name */}
                                    <span className="thread-card__body">
                                        <span className="thread-card__name">{row.label}</span>
                                    </span>

                                    {/* Actions */}
                                    <span
                                        className="thread-card__actions"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        {pendingDelete === rowKey ? (
                                            /* ── Inline delete confirmation ── */
                                            <>
                                                <span className="thread-card__delete-label">Delete?</span>
                                                <button
                                                    className="icon-btn remove-btn"
                                                    onClick={() => {
                                                        setPendingDelete(null);
                                                        removePerformer(row.id);
                                                    }}
                                                    title="Confirm delete"
                                                >
                                                    <Check size={11} />
                                                </button>
                                                <button
                                                    className="icon-btn"
                                                    onClick={() => setPendingDelete(null)}
                                                    title="Cancel delete"
                                                >
                                                    <X size={11} />
                                                </button>
                                            </>
                                        ) : (
                                            /* ── Normal actions ── */
                                            <>
                                                <button
                                                    className={`icon-btn ${row.hidden ? 'visibility-off' : 'visibility-on'}`}
                                                    onClick={() => togglePerformerVisibility(row.id)}
                                                    title={row.hidden ? 'Show performer' : 'Hide performer'}
                                                >
                                                    {row.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                                                </button>
                                                <button
                                                    className={`icon-btn ${(editingTarget?.type === 'performer' && editingTarget.id === row.id) ? 'icon-btn--active' : ''}`}
                                                    onClick={() => {
                                                        openPerformerEditor(row.id, 'performer-runtime');
                                                        setActiveChatPerformer(row.id);
                                                    }}
                                                    title="Edit performer"
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                                <button
                                                    className="icon-btn"
                                                    onClick={() => {
                                                        savePerformerAsDraft(row.id);
                                                        showToast(`Saved "${row.label}" as draft`, 'success', {
                                                            title: 'Draft saved',
                                                            dedupeKey: `draft:save:${row.id}`,
                                                        });
                                                    }}
                                                    title="Save performer as draft"
                                                >
                                                    <Archive size={11} />
                                                </button>
                                                <button
                                                    className="icon-btn remove-btn"
                                                    onClick={() => setPendingDelete(rowKey)}
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
                                                        onChange={(value) => setRenamingSession((current) => current ? { ...current, value } : current)}
                                                        onCommit={() => void commitRenameSession()}
                                                        onCancel={cancelRenameSession}
                                                    />
                                                )}
                                                meta={entry.active ? 'Current thread' : 'Saved thread'}
                                                metaTone={entry.active ? 'success' : 'default'}
                                                active={selectedPerformerSessionId === entry.session.id}
                                                onClick={renamingSession?.key === `performer:${entry.session.id}` ? undefined : () => openPerformerSession(row.id, entry.session)}
                                                actions={(
                                                    <SessionRowActions
                                                        renaming={renamingSession?.key === `performer:${entry.session.id}` ? renamingSession : null}
                                                        onCommit={() => void commitRenameSession()}
                                                        onCancel={cancelRenameSession}
                                                        onRename={() => beginRenamePerformerSession(entry.session)}
                                                        onDelete={() => deleteSession(entry.session.id)}
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
                        );
                    })}{acts.map((act) => {
                        const actKey = `act-${act.id}`;
                        const isActSelected = selectedActId === act.id;
                        const participantCount = Object.keys(act.participants).length;
                        const actExpanded = expandedRows[actKey] ?? false;
                        const threads = actThreads[act.id] || [];

                        return (
                            <div key={actKey} className="thread-group">
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
                                            switchFocusTarget(act.id, 'act');
                                        }
                                        selectAct(act.id);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            if (focusedPerformerId && focusedPerformerId !== act.id) {
                                                switchFocusTarget(act.id, 'act');
                                            }
                                            selectAct(act.id);
                                        }
                                    }}
                                >
                                    {/* Toggle chevron */}
                                    <span
                                        className={`thread-card__chevron ${actExpanded ? 'is-open' : ''}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            toggleExpanded(actKey);
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
                                    <span
                                        className="thread-card__actions"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <button
                                            className="icon-btn"
                                            onClick={() => createThread(act.id)}
                                            title="New Thread"
                                        >
                                            <Plus size={11} />
                                        </button>
                                        <button
                                            className="icon-btn"
                                            onClick={() => enterActLayoutMode(act.id)}
                                            title="Advanced Layout"
                                        >
                                            <Pencil size={11} />
                                        </button>
                                        <button
                                            className="icon-btn"
                                            onClick={() => {
                                                saveActAsDraft(act.id);
                                                showToast(`Saved "${act.name}" as draft`, 'success', {
                                                    title: 'Draft saved',
                                                    dedupeKey: `draft:save:act:${act.id}`,
                                                });
                                            }}
                                            title="Save act as draft"
                                        >
                                            <Archive size={11} />
                                        </button>
                                        <button
                                            className={`icon-btn ${act.hidden ? 'icon-btn--active' : ''}`}
                                            onClick={() => toggleActVisibility(act.id)}
                                            title={act.hidden ? 'Show on canvas' : 'Hide from canvas'}
                                        >
                                            {act.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                                        </button>
                                        <button
                                            className="icon-btn remove-btn"
                                            onClick={() => removeAct(act.id)}
                                            title="Delete act"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </span>
                                </div>
                                {actExpanded && (
                                    <div className="thread-children">
                                        {threads.length > 0 ? threads.map((thread) => {
                                            const isThreadActive = activeThreadId === thread.id;
                                            const statusIcon = thread.status === 'active' ? '●' : thread.status === 'completed' ? '✓' : '⏸';
                                            const statusClass = `thread-status--${thread.status || 'idle'}`;
                                            const threadKey = `thread-${thread.id}`;
                                            const threadExpanded = expandedRows[threadKey] ?? false;
                                            const boundParticipantKeys = Object.keys(act.participants);
                                            return (
                                                <div key={thread.id} className="thread-group">
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`layer-row ${isThreadActive ? 'active' : ''}`}
                                                        onClick={() => {
                                                            selectThread(thread.id);
                                                            selectAct(act.id);
                                                        }}
                                                    >
                                                        {boundParticipantKeys.length > 0 ? (
                                                            <span
                                                                className={`thread-card__chevron ${threadExpanded ? 'is-open' : ''}`}
                                                                onClick={(ev) => {
                                                                    ev.stopPropagation();
                                                                    toggleExpanded(threadKey);
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
                                                    {threadExpanded && (
                                                        <div className="thread-children">
                                                            <LayerRow
                                                                icon={<Activity size={10} />}
                                                                label="Callboard / Activity"
                                                                active={isThreadActive && !activeThreadParticipantKey}
                                                                onClick={() => {
                                                                    selectThread(thread.id);
                                                                    selectThreadParticipant(null);
                                                                    selectAct(act.id);
                                                                }}
                                                            />
                                                            {boundParticipantKeys.length > 0 && boundParticipantKeys.map((pKey) => (
                                                                <LayerRow
                                                                    key={pKey}
                                                                    icon={<User size={10} />}
                                                                    label={resolveActParticipantLabel(act, pKey, performers)}
                                                                    active={isThreadActive && activeThreadParticipantKey === pKey}
                                                                    onClick={() => {
                                                                        selectThread(thread.id);
                                                                        selectThreadParticipant(pKey);
                                                                        selectAct(act.id);
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }) : (
                                            <div className="empty-state empty-state--tight empty-state--nested">
                                                No threads — click + to create one
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}</> : (
                        <div className="empty-state">
                            Add a performer to start building this stage.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
