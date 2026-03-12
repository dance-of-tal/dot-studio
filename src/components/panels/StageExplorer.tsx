import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { useStudioStore } from '../../store';
import { mapSessionMessagesToChatMessages } from '../../lib/chat-messages';
import { parseStudioSessionTitle, renameStudioSessionTitle } from '../../../shared/session-metadata';
import {
    Check,
    ChevronRight,
    Eye,
    EyeOff,
    Folder,
    GitBranch,
    MessageSquare,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import './StageExplorer.css';
import {
    stageLabel,
    actSessionTone,
    buildPerformerSessionRows,
    groupPerformerSessionsById,
    groupActSessionsByActId,
    buildLatestActSessionMap,
    buildThreadRows,
    LayerRow,
    SessionNameEditor,
    SessionRowActions,
} from './stage-explorer-utils';
import type { ExplorerRenamingSession } from './stage-explorer-utils';






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
        acts,
        sessions,
        actSessions,
        actSessionMap,
        sessionMap,
        editingTarget,
        selectedPerformerId,
        selectedPerformerSessionId,
        selectedActId,
        selectedActSessionId,
        newStage,
        loadStage,
        listStages,
        listSessions,
        deleteStage,
        addPerformer,
        addAct,
        selectPerformer,
        selectPerformerSession,
        selectAct,
        selectActSession,
        setActThreadSession,
        setActiveChatPerformer,
        openPerformerEditor,
        openActEditor,
        closeEditor,
        deleteSession,
        deleteActSession,
        togglePerformerVisibility,
        toggleActVisibility,
        removePerformer,
        removeAct,
        renameActSession,
    } = useStudioStore();

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [renamingSession, setRenamingSession] = useState<ExplorerRenamingSession>(null);

    useEffect(() => {
        listStages();
        listSessions();
    }, [listSessions, listStages, workingDir]);

    const sharedPerformers = useMemo(
        () => performers.filter((performer) => performer.scope !== 'act-owned'),
        [performers],
    );

    const performerSessionRows = useMemo(() => {
        return buildPerformerSessionRows(sessions, performers, sessionMap);
    }, [performers, sessionMap, sessions]);

    const performerSessionsById = useMemo(() => {
        return groupPerformerSessionsById(performerSessionRows);
    }, [performerSessionRows]);

    const actSessionsByActId = useMemo(() => {
        return groupActSessionsByActId(actSessions);
    }, [actSessions]);

    const latestActSessionMap = useMemo(() => {
        return buildLatestActSessionMap(actSessionMap, actSessionsByActId);
    }, [actSessionMap, actSessionsByActId]);

    const threadRows = useMemo(() => {
        return buildThreadRows({
            sharedPerformers,
            acts,
            editingTarget,
            latestActSessionMap,
            performerSessionsById,
            actSessionsByActId,
            selectedPerformerId,
            selectedPerformerSessionId,
            selectedActId,
            selectedActSessionId,
        });
    }, [actSessionsByActId, acts, editingTarget, latestActSessionMap, performerSessionsById, selectedActId, selectedActSessionId, selectedPerformerId, selectedPerformerSessionId, sharedPerformers]);

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

    const beginRenameActSession = useCallback((session: { id: string; title: string }) => {
        setRenamingSession({
            key: `act:${session.id}`,
            kind: 'act',
            sessionId: session.id,
            currentTitle: session.title,
            value: session.title,
        });
    }, []);

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
            if (renamingSession.kind === 'performer') {
                const nextTitle = renameStudioSessionTitle(renamingSession.currentTitle, nextLabel);
                if (!nextTitle) {
                    throw new Error('Studio could not preserve thread metadata while renaming this session.');
                }
                await api.chat.updateSession(renamingSession.sessionId, nextTitle);
                await listSessions();
            } else {
                renameActSession(renamingSession.sessionId, nextLabel);
            }
            setRenamingSession(null);
        } catch (error) {
            console.error('Failed to rename session', error);
            showToast('Studio could not rename that thread.', 'error', {
                title: 'Thread rename failed',
                dedupeKey: `thread:rename:${renamingSession.sessionId}`,
            });
        }
    }, [cancelRenameSession, listSessions, renameActSession, renamingSession]);

    const openPerformer = (performerId: string) => {
        closeEditor();
        selectPerformerSession(null);
        // Clear existing session binding so canvas shows an empty chat
        useStudioStore.setState((state) => ({
            sessionMap: { ...state.sessionMap, [performerId]: '' },
            chats: { ...state.chats, [performerId]: [] },
        }));
        selectPerformer(performerId);
        setActiveChatPerformer(performerId);
    };

    const openPerformerSession = async (performerId: string, session: { id: string; title?: string }) => {
        const metadata = parseStudioSessionTitle(session.title);
        useStudioStore.setState((state) => ({
            sessionMap: { ...state.sessionMap, [performerId]: session.id },
            sessionConfigMap: {
                ...state.sessionConfigMap,
                [performerId]: metadata?.configHash || '',
            },
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
        selectPerformer(performerId);
        selectPerformerSession(session.id);
        setActiveChatPerformer(performerId);
    };

    const openAct = (actId: string) => {
        closeEditor();
        selectAct(actId);
    };

    const openActSession = (actId: string, sessionId: string) => {
        closeEditor();
        selectAct(actId);
        setActThreadSession(actId, sessionId);
        selectActSession(sessionId);
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
                            onClick={() => addPerformer(`Performer ${sharedPerformers.length + 1}`, 80 + (sharedPerformers.length * 24), 80 + (sharedPerformers.length * 18))}
                            title="Add performer"
                        >
                            <MessageSquare size={12} />
                        </button>
                        <button className="icon-btn" onClick={() => addAct()} title="Add act">
                            <GitBranch size={12} />
                        </button>
                    </div>
                </div>
                <div className="explorer__tree scroll-area">
                    {threadRows.length > 0 ? threadRows.map((row) => {
                        const rowKey = `${row.kind}-${row.id}`;
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
                                    onClick={() => {
                                        if (row.kind === 'performer') {
                                            openPerformer(row.id);
                                            return;
                                        }
                                        openAct(row.id);
                                    }}
                                    onKeyDown={(event) => {
                                        if ((event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault();
                                            if (row.kind === 'performer') openPerformer(row.id);
                                            else openAct(row.id);
                                        }
                                    }}
                                >
                                    {/* Toggle chevron – always visible */}
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
                                        {row.kind === 'performer'
                                            ? <MessageSquare size={13} />
                                            : <GitBranch size={13} />}
                                    </span>

                                    {/* Name */}
                                    <span className="thread-card__body">
                                        <span className="thread-card__name">{row.label}</span>
                                    </span>

                                    {/* Always-visible actions */}
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
                                                        if (row.kind === 'performer') {
                                                            removePerformer(row.id);
                                                        } else {
                                                            removeAct(row.id);
                                                        }
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
                                                    onClick={() => {
                                                        if (row.kind === 'performer') {
                                                            togglePerformerVisibility(row.id);
                                                            return;
                                                        }
                                                        toggleActVisibility(row.id);
                                                    }}
                                                    title={row.hidden ? `Show ${row.kind}` : `Hide ${row.kind}`}
                                                >
                                                    {row.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                                                </button>
                                                <button
                                                    className={`icon-btn ${(editingTarget?.type === row.kind && editingTarget.id === row.id) ? 'icon-btn--active' : ''}`}
                                                    onClick={() => {
                                                        if (row.kind === 'performer') {
                                                            openPerformerEditor(row.id, 'performer-runtime');
                                                            setActiveChatPerformer(row.id);
                                                            return;
                                                        }
                                                        openActEditor(row.id, 'act-structure');
                                                    }}
                                                    title={`Edit ${row.kind}`}
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                                <button
                                                    className="icon-btn remove-btn"
                                                    onClick={() => setPendingDelete(rowKey)}
                                                    title={`Delete ${row.kind}`}
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </>
                                        )}
                                    </span>
                                </div>
                                {expanded ? (
                                    <div className="thread-children">
                                        {row.kind === 'performer' ? (
                                            row.children.length > 0 ? row.children.map((entry) => (
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
                                            )
                                        ) : (
                                            row.children.length > 0 ? row.children.map((session) => (
                                                <LayerRow
                                                    key={session.id}
                                                    icon={<MessageSquare size={11} className={selectedActSessionId === session.id ? 'icon-active' : 'icon-muted'} />}
                                                    label={(
                                                        <SessionNameEditor
                                                            renaming={renamingSession?.key === `act:${session.id}` ? renamingSession : null}
                                                            display={session.title}
                                                            onChange={(value) => setRenamingSession((current) => current ? { ...current, value } : current)}
                                                            onCommit={() => void commitRenameSession()}
                                                            onCancel={cancelRenameSession}
                                                        />
                                                    )}
                                                    meta={actSessionMap[row.id] === session.id ? `Current · ${session.status}` : session.status}
                                                    metaTone={actSessionTone(session.status)}
                                                    active={selectedActSessionId === session.id}
                                                    onClick={renamingSession?.key === `act:${session.id}` ? undefined : () => openActSession(row.id, session.id)}
                                                    actions={(
                                                        <SessionRowActions
                                                            renaming={renamingSession?.key === `act:${session.id}` ? renamingSession : null}
                                                            onCommit={() => void commitRenameSession()}
                                                            onCancel={cancelRenameSession}
                                                            onRename={() => beginRenameActSession(session)}
                                                            onDelete={() => deleteActSession(session.id)}
                                                            renameTitle="Rename act session"
                                                            deleteTitle="Delete act session"
                                                        />
                                                    )}
                                                />
                                            )) : (
                                                <div className="empty-state empty-state--tight empty-state--nested">
                                                    No threads yet
                                                </div>
                                            )
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        );
                    }) : (
                        <div className="empty-state">
                            Add a performer or act to start building this stage.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
