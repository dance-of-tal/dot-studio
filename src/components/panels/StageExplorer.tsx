import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

function stageLabel(workingDir: string) {
    const normalized = workingDir.trim().replace(/\/+$/, '');
    return normalized.split(/[/\\]/).pop() || 'Working Directory';
}

function LayerRow({
    icon,
    label,
    meta,
    metaTone = 'default',
    active = false,
    onClick,
    actions,
    muted = false,
}: {
    icon: ReactNode;
    label: ReactNode;
    meta?: string;
    metaTone?: 'default' | 'success' | 'warn' | 'danger';
    active?: boolean;
    muted?: boolean;
    onClick?: () => void;
    actions?: ReactNode;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            className={`figma-layer-row ${active ? 'active' : ''} ${muted ? 'muted' : ''}`}
            onClick={onClick}
            onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && onClick) {
                    event.preventDefault();
                    onClick();
                }
            }}
        >
            <span className="figma-layer-row__icon">{icon}</span>
            <span className="figma-layer-row__body">
                <span className="figma-layer-row__label">{label}</span>
                {meta ? (
                    <span className={`figma-layer-row__meta figma-layer-row__meta--${metaTone}`}>
                        {meta}
                    </span>
                ) : null}
            </span>
            {actions ? (
                <span
                    className="figma-layer-row__actions"
                    onClick={(event) => event.stopPropagation()}
                >
                    {actions}
                </span>
            ) : null}
        </div>
    );
}

function actSessionTone(status: string): 'default' | 'success' | 'warn' | 'danger' {
    switch (status) {
        case 'completed':
            return 'success';
        case 'interrupted':
            return 'warn';
        case 'failed':
            return 'danger';
        default:
            return 'default';
    }
}

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
    const [renamingSession, setRenamingSession] = useState<null | {
        key: string
        kind: 'performer' | 'act'
        sessionId: string
        currentTitle?: string
        value: string
    }>(null);

    useEffect(() => {
        listStages();
        listSessions();
    }, [listSessions, listStages, workingDir]);

    const sharedPerformers = useMemo(
        () => performers.filter((performer) => performer.scope !== 'act-owned'),
        [performers],
    );

    const performerSessionRows = useMemo(() => {
        const rows = sessions
            .map((session) => {
                const metadata = parseStudioSessionTitle(session.title);
                const performerId = metadata?.performerId || null;
                const performer = performerId ? performers.find((item) => item.id === performerId) || null : null;
                if (!performer) {
                    return null;
                }
                return {
                    session,
                    performerId,
                    active: sessionMap[performer.id] === session.id,
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> & { performerId: string } => !!entry && typeof entry.performerId === 'string');

        const seen = new Set<string>();
        return rows.filter((entry) => {
            if (seen.has(entry.session.id)) {
                return false;
            }
            seen.add(entry.session.id);
            return true;
        });
    }, [performers, sessionMap, sessions]);

    const performerSessionsById = useMemo(() => {
        const map = new Map<string, typeof performerSessionRows>();
        performerSessionRows.forEach((entry) => {
            const current = map.get(entry.performerId) || [];
            current.push(entry);
            map.set(entry.performerId, current);
        });
        map.forEach((entries, performerId) => {
            map.set(performerId, [...entries].sort((left, right) => (right.session.createdAt || 0) - (left.session.createdAt || 0)));
        });
        return map;
    }, [performerSessionRows]);

    const actSessionsByActId = useMemo(() => {
        const map = new Map<string, typeof actSessions>();
        [...actSessions]
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .forEach((session) => {
                const current = map.get(session.actId) || [];
                current.push(session);
                map.set(session.actId, current);
            });
        return map;
    }, [actSessions]);

    const latestActSessionMap = useMemo(() => {
        const map = new Map<string, { status: string }>();
        actSessionsByActId.forEach((sessionsForAct, actId) => {
            const currentSessionId = actSessionMap[actId];
            const currentSession = currentSessionId
                ? sessionsForAct.find((session) => session.id === currentSessionId) || sessionsForAct[0]
                : sessionsForAct[0];
            if (currentSession) {
                map.set(actId, { status: currentSession.status });
            }
        });
        return map;
    }, [actSessionMap, actSessionsByActId]);

    const threadRows = useMemo(() => {
        const performerRows = sharedPerformers.map((performer) => ({
            id: performer.id,
            kind: 'performer' as const,
            label: performer.name,
            meta: performer.model?.modelId || 'No model selected',
            hidden: !!performer.hidden,
            active: ((selectedPerformerId === performer.id) || (editingTarget?.type === 'performer' && editingTarget.id === performer.id))
                && !selectedPerformerSessionId,
            children: performerSessionsById.get(performer.id) || [],
        }));

        const actRows = acts.map((act) => {
            const latestSession = latestActSessionMap.get(act.id);
            return {
                id: act.id,
                kind: 'act' as const,
                label: act.name,
                meta: latestSession ? `${latestSession.status} · ${act.nodes.length} nodes` : `${act.nodes.length} nodes`,
                hidden: !!act.hidden,
                active: ((selectedActId === act.id) || (editingTarget?.type === 'act' && editingTarget.id === act.id))
                    && !selectedActSessionId,
                children: actSessionsByActId.get(act.id) || [],
            };
        });

        return [...performerRows, ...actRows];
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
        <div className="figma-explorer figma-explorer--stacked">
            <section className="figma-explorer-section figma-explorer-section--stages" style={{ flex: `0 0 ${stagesHeight}px` }}>
                <div className="figma-explorer__subheader">
                    <span className="figma-explorer__title">Stages</span>
                    <button className="icon-btn" onClick={newStage} title="Open working directory">
                        <Plus size={12} />
                    </button>
                </div>
                <div className="figma-explorer__context">
                    <span className="figma-explorer__context-label">Current</span>
                    <strong>{workingDir ? stageLabel(workingDir) : 'No working directory'}</strong>
                    {workingDir ? (
                        <span className="figma-explorer__context-path" title={workingDir}>
                            {workingDir}
                        </span>
                    ) : null}
                </div>
                <div className="figma-explorer__tree figma-scroll">
                    {stageRows.length > 0 ? stageRows : <div className="figma-empty">No saved working directories</div>}
                </div>
            </section>

            <div className="figma-explorer__divider" onMouseDown={onDividerMouseDown} />

            <section className="figma-explorer-section figma-explorer-section--threads">
                <div className="figma-explorer__subheader">
                    <span className="figma-explorer__title">Threads</span>
                    <div className="figma-explorer__actions">
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
                <div className="figma-explorer__tree figma-scroll">
                    {threadRows.length > 0 ? threadRows.map((row) => {
                        const rowKey = `${row.kind}-${row.id}`;
                        const expanded = expandedRows[rowKey] ?? false;

                        return (
                            <div key={rowKey} className="figma-thread-group">
                                {/* ── Thread Row ── */}
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={[
                                        'figma-thread-card',
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
                                        className={`figma-thread-card__chevron ${expanded ? 'is-open' : ''}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            toggleExpanded(rowKey);
                                        }}
                                    >
                                        <ChevronRight size={12} />
                                    </span>

                                    {/* Type icon */}
                                    <span className="figma-thread-card__icon">
                                        {row.kind === 'performer'
                                            ? <MessageSquare size={13} />
                                            : <GitBranch size={13} />}
                                    </span>

                                    {/* Name */}
                                    <span className="figma-thread-card__body">
                                        <span className="figma-thread-card__name">{row.label}</span>
                                    </span>

                                    {/* Always-visible actions */}
                                    <span
                                        className="figma-thread-card__actions"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        {pendingDelete === rowKey ? (
                                            /* ── Inline delete confirmation ── */
                                            <>
                                                <span className="figma-thread-card__delete-label">Delete?</span>
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
                                    <div className="figma-thread-children">
                                        {row.kind === 'performer' ? (
                                            row.children.length > 0 ? row.children.map((entry) => (
                                                <LayerRow
                                                    key={entry.session.id}
                                                    icon={<MessageSquare size={11} className={entry.active ? 'icon-active' : 'icon-muted'} />}
                                                    label={renamingSession?.key === `performer:${entry.session.id}` ? (
                                                        <input
                                                            autoFocus
                                                            className="figma-thread-inline-input"
                                                            value={renamingSession.value}
                                                            onChange={(event) => setRenamingSession((current) => current ? { ...current, value: event.target.value } : current)}
                                                            onClick={(event) => event.stopPropagation()}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    void commitRenameSession();
                                                                } else if (event.key === 'Escape') {
                                                                    event.preventDefault();
                                                                    cancelRenameSession();
                                                                }
                                                            }}
                                                        />
                                                    ) : performerSessionLabel(entry.session)}
                                                    meta={entry.active ? 'Current thread' : 'Saved thread'}
                                                    metaTone={entry.active ? 'success' : 'default'}
                                                    active={selectedPerformerSessionId === entry.session.id}
                                                    onClick={renamingSession?.key === `performer:${entry.session.id}` ? undefined : () => openPerformerSession(row.id, entry.session)}
                                                    actions={
                                                        renamingSession?.key === `performer:${entry.session.id}` ? (
                                                            <>
                                                                <button className="icon-btn" onClick={() => void commitRenameSession()} title="Save name">
                                                                    <Check size={10} />
                                                                </button>
                                                                <button className="icon-btn" onClick={cancelRenameSession} title="Cancel rename">
                                                                    <X size={10} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    className="icon-btn"
                                                                    onClick={() => beginRenamePerformerSession(entry.session)}
                                                                    title="Rename session"
                                                                >
                                                                    <Pencil size={10} />
                                                                </button>
                                                                <button
                                                                    className="icon-btn remove-btn"
                                                                    onClick={() => deleteSession(entry.session.id)}
                                                                    title="Delete session"
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            </>
                                                        )
                                                    }
                                                />
                                            )) : (
                                                <div className="figma-empty figma-empty--tight figma-empty--nested">
                                                    No threads yet
                                                </div>
                                            )
                                        ) : (
                                            row.children.length > 0 ? row.children.map((session) => (
                                                <LayerRow
                                                    key={session.id}
                                                    icon={<MessageSquare size={11} className={selectedActSessionId === session.id ? 'icon-active' : 'icon-muted'} />}
                                                    label={renamingSession?.key === `act:${session.id}` ? (
                                                        <input
                                                            autoFocus
                                                            className="figma-thread-inline-input"
                                                            value={renamingSession.value}
                                                            onChange={(event) => setRenamingSession((current) => current ? { ...current, value: event.target.value } : current)}
                                                            onClick={(event) => event.stopPropagation()}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    void commitRenameSession();
                                                                } else if (event.key === 'Escape') {
                                                                    event.preventDefault();
                                                                    cancelRenameSession();
                                                                }
                                                            }}
                                                        />
                                                    ) : session.title}
                                                    meta={actSessionMap[row.id] === session.id ? `Current · ${session.status}` : session.status}
                                                    metaTone={actSessionTone(session.status)}
                                                    active={selectedActSessionId === session.id}
                                                    onClick={renamingSession?.key === `act:${session.id}` ? undefined : () => openActSession(row.id, session.id)}
                                                    actions={
                                                        renamingSession?.key === `act:${session.id}` ? (
                                                            <>
                                                                <button className="icon-btn" onClick={() => void commitRenameSession()} title="Save name">
                                                                    <Check size={10} />
                                                                </button>
                                                                <button className="icon-btn" onClick={cancelRenameSession} title="Cancel rename">
                                                                    <X size={10} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    className="icon-btn"
                                                                    onClick={() => beginRenameActSession(session)}
                                                                    title="Rename act session"
                                                                >
                                                                    <Pencil size={10} />
                                                                </button>
                                                                <button
                                                                    className="icon-btn remove-btn"
                                                                    onClick={() => deleteActSession(session.id)}
                                                                    title="Delete act session"
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            </>
                                                        )
                                                    }
                                                />
                                            )) : (
                                                <div className="figma-empty figma-empty--tight figma-empty--nested">
                                                    No threads yet
                                                </div>
                                            )
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        );
                    }) : (
                        <div className="figma-empty">
                            Add a performer or act to start building this stage.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
