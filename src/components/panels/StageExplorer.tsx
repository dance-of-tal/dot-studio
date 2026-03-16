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
    MessageSquare,
    Pencil,
    Plus,
    Send,
    Trash2,
    X,
    Zap,
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
    } = useStudioStore();

    const acts = useStudioStore((s) => s.acts);
    const selectedActId = useStudioStore((s) => s.selectedActId);
    const selectAct = useStudioStore((s) => s.selectAct);
    const removeAct = useStudioStore((s) => s.removeAct);
    const setActExecutionMode = useStudioStore((s) => s.setActExecutionMode);
    const sendActMessage = useStudioStore((s) => s.sendActMessage);
    const loadingPerformerId = useStudioStore((s) => s.loadingPerformerId);
    const actChats = useStudioStore((s) => s.actChats);

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [renamingSession, setRenamingSession] = useState<ExplorerRenamingSession>(null);
    const [actMessage, setActMessage] = useState('');
    const [actCaller, setActCaller] = useState<string | null>(null);

    useEffect(() => {
        listStages();
        listSessions();
    }, [listSessions, listStages, workingDir]);

    const sharedPerformers = useMemo(
        () => performers.filter((performer) => performer.scope === 'shared'),
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
            switchFocusTarget(performerId);
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
            switchFocusTarget(performerId);
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
                        >
                            <MessageSquare size={12} />
                        </button>
                        <button
                            className="icon-btn"
                            onClick={() => useStudioStore.getState().addAct(`Act ${acts.length + 1}`)}
                            title="Add Act"
                        >
                            <Zap size={12} />
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
                        const isActSelected = selectedActId === act.id;
                        const performerCount = Object.keys(act.performers).length;
                        return (
                            <div key={`act-${act.id}`} className="thread-group">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={[
                                        'thread-card',
                                        isActSelected ? 'active' : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => selectAct(isActSelected ? null : act.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            selectAct(isActSelected ? null : act.id);
                                        }
                                    }}
                                >
                                    <span className="thread-card__icon">
                                        <Zap size={13} />
                                    </span>
                                    <span className="thread-card__body">
                                        <span className="thread-card__name">{act.name}</span>
                                        <span className="thread-card__meta">
                                            {performerCount}p · {act.relations.length}r · {act.executionMode}
                                        </span>
                                    </span>
                                    <span
                                        className="thread-card__actions"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <button
                                            className={`icon-btn ${act.executionMode === 'safe' ? 'icon-btn--active' : ''}`}
                                            onClick={() => setActExecutionMode(act.id, act.executionMode === 'direct' ? 'safe' : 'direct')}
                                            title={`Switch to ${act.executionMode === 'direct' ? 'safe' : 'direct'} mode`}
                                        >
                                            {act.executionMode === 'safe' ? <Eye size={11} /> : <EyeOff size={11} />}
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
                                {isActSelected && performerCount > 0 && (
                                    <div className="act-chat-input">
                                        {(actChats[act.id] || []).length > 0 && (
                                            <div className="act-chat-messages">
                                                {(actChats[act.id] || []).slice(-5).map((msg) => (
                                                    <div key={msg.id} className={`act-chat-msg act-chat-msg--${msg.role}`}>
                                                        <span className="act-chat-msg__role">{msg.role === 'user' ? '▸' : msg.role === 'assistant' ? '◂' : '●'}</span>
                                                        <span className="act-chat-msg__text">{typeof msg.content === 'string' ? msg.content.slice(0, 120) : '...'}{typeof msg.content === 'string' && msg.content.length > 120 ? '…' : ''}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <select
                                            className="act-chat-input__caller"
                                            value={actCaller && act.performers[actCaller] ? actCaller : Object.keys(act.performers)[0] || ''}
                                            onChange={(e) => setActCaller(e.target.value)}
                                        >
                                            {Object.entries(act.performers).map(([id, p]) => (
                                                <option key={id} value={id}>{p.name}</option>
                                            ))}
                                        </select>
                                        <input
                                            className="act-chat-input__message"
                                            type="text"
                                            placeholder="Send message as performer..."
                                            value={actMessage}
                                            onChange={(e) => setActMessage(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && actMessage.trim()) {
                                                    const caller = actCaller && act.performers[actCaller] ? actCaller : Object.keys(act.performers)[0];
                                                    if (caller) {
                                                        sendActMessage(act.id, caller, actMessage.trim());
                                                        setActMessage('');
                                                    }
                                                }
                                            }}
                                            disabled={!!loadingPerformerId}
                                        />
                                        <button
                                            className="icon-btn"
                                            title="Send"
                                            disabled={!actMessage.trim() || !!loadingPerformerId}
                                            onClick={() => {
                                                const caller = actCaller && act.performers[actCaller] ? actCaller : Object.keys(act.performers)[0];
                                                if (caller && actMessage.trim()) {
                                                    sendActMessage(act.id, caller, actMessage.trim());
                                                    setActMessage('');
                                                }
                                            }}
                                        >
                                            <Send size={11} />
                                        </button>
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
