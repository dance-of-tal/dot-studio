import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { useStudioStore } from '../../store';
import { DropdownMenu } from '../shared/DropdownMenu';
import { mapSessionMessagesToChatMessages } from '../../lib/chat-messages';
import { parseStudioSessionTitle, renameStudioSessionTitle } from '../../../shared/session-metadata';
import {
    Folder,
    MoreHorizontal,
} from 'lucide-react';
import './WorkspaceExplorer.css';
import './WorkspaceExplorerItems.css';
import {
    workspaceLabel,
    buildPerformerSessionRows,
    groupPerformerSessionsById,
    buildThreadRows,
    LayerRow,
} from './workspace-explorer-utils';
import type { ExplorerRenamingSession } from './workspace-explorer-utils';
import WorkspaceExplorerWorkspacesSection from './WorkspaceExplorerWorkspacesSection';
import WorkspaceExplorerThreadsSection from './WorkspaceExplorerThreadsSection';


export default function WorkspaceExplorer() {
    const [workspacesHeight, setWorkspacesHeight] = useState(208);
    const dividerDragging = useRef(false);

    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dividerDragging.current = true;
        const startY = e.clientY;
        const startH = workspacesHeight;

        const onMove = (ev: MouseEvent) => {
            if (!dividerDragging.current) return;
            const delta = ev.clientY - startY;
            setWorkspacesHeight(Math.min(400, Math.max(80, startH + delta)));
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
    }, [workspacesHeight]);
    const {
        workspaceId,
        workingDir,
        workspaceList,
        performers,
        sessions,
        sessionMap,
        editingTarget,
        selectedPerformerId,
        selectedPerformerSessionId,
        newWorkspace,
        closeWorkspace,
        loadWorkspace,
        listWorkspaces,
        listSessions,
        deleteWorkspace,
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

    const toggleActVisibility = useStudioStore((s) => s.toggleActVisibility);
    const actThreads = useStudioStore((s) => s.actThreads);
    const activeThreadId = useStudioStore((s) => s.activeThreadId);
    const createThread = useStudioStore((s) => s.createThread);
    const selectThread = useStudioStore((s) => s.selectThread);
    const deleteThread = useStudioStore((s) => s.deleteThread);
    const renameThread = useStudioStore((s) => s.renameThread);
    const startNewSession = useStudioStore((s) => s.startNewSession);
    const openActEditor = useStudioStore((s) => s.openActEditor);

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [renamingSession, setRenamingSession] = useState<ExplorerRenamingSession>(null);

    const openWorkspacePath = useCallback(async (targetPath: string) => {
        try {
            await api.studio.openPath(targetPath);
        } catch (error) {
            console.error('Failed to open workspace path', error);
            showToast('Studio could not open that workspace path.', 'error', {
                title: 'Open failed',
                dedupeKey: `workspace:open:${targetPath}`,
            });
        }
    }, []);

    useEffect(() => {
        listWorkspaces();
        listSessions();
    }, [listSessions, listWorkspaces, workingDir]);

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
            editingTarget: editingTarget?.type === 'performer' ? editingTarget : null,
            performerSessionsById,
            selectedPerformerId,
            selectedPerformerSessionId,
        });
    }, [editingTarget, performerSessionsById, selectedPerformerId, selectedPerformerSessionId, sharedPerformers]);

    const workspaceRows = workspaceList.map((entry) => {
        const segments = entry.workingDir.trim().replace(/\/+$/, '').split('/');
        const shortPath = segments.length > 2 ? `…/${segments.slice(-2).join('/')}` : entry.workingDir;
        return (
            <LayerRow
                key={entry.id}
                icon={<Folder size={12} className={entry.id === workspaceId ? 'icon-active' : 'icon-muted'} />}
                label={workspaceLabel(entry.workingDir)}
                meta={shortPath}
                active={entry.id === workspaceId}
                onClick={() => loadWorkspace(entry.id)}
                actions={
                    <DropdownMenu
                        align="right"
                        trigger={(
                            <button className="icon-btn" title="Workspace actions">
                                <MoreHorizontal size={10} />
                            </button>
                        )}
                        items={[
                            {
                                label: 'Open',
                                onClick: () => {
                                    void openWorkspacePath(entry.workingDir);
                                },
                            },
                            'separator',
                            {
                                label: 'Close workspace',
                                onClick: () => closeWorkspace(),
                                disabled: entry.id !== workspaceId,
                            },
                            'separator',
                            {
                                label: 'Delete workspace',
                                onClick: () => deleteWorkspace(entry.id),
                                variant: 'danger',
                            },
                        ]}
                    />
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
        return metadata?.label || ('slug' in session && typeof session.slug === 'string' ? session.slug : null) || session.id.slice(0, 8);
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

    const switchFocusTarget = useStudioStore((s) => s.switchFocusTarget);
    const revealCanvasNode = useStudioStore((s) => s.revealCanvasNode);

    const openPerformer = (performerId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            focusedPerformerId: currentFocusedId,
            focusedNodeType: currentFocusedNodeType,
            performers: currentPerformers,
            unregisterBinding,
        } = useStudioStore.getState();

        // Auto-unhide performer when clicking it in the sidebar
        const perf = currentPerformers.find((p) => p.id === performerId);
        if (perf?.hidden) {
            useStudioStore.setState((s) => ({
                performers: s.performers.map((p) => (p.id === performerId ? { ...p, hidden: false } : p)),
            }));
        }

        closeEditor();
        selectPerformerSession(null);
        unregisterBinding(performerId);
        // Clear existing session binding so canvas shows an empty chat
        useStudioStore.setState((state) => ({
            sessionMap: { ...state.sessionMap, [performerId]: '' },
            chats: { ...state.chats, [performerId]: [] },
        }));
        const shouldSwitchFocus = currentFocusSnapshot && (
            currentFocusedId !== performerId
            || currentFocusedNodeType !== 'performer'
        )
        if (shouldSwitchFocus) {
            switchFocusTarget(performerId, 'performer');
        } else {
            selectPerformer(performerId);
        }
        setActiveChatPerformer(performerId);
        revealCanvasNode(performerId, 'performer');
    };

    const openPerformerSession = async (performerId: string, session: { id: string; title?: string }) => {
        useStudioStore.getState().registerBinding(performerId, session.id);
        useStudioStore.setState((state) => ({
            sessionMap: { ...state.sessionMap, [performerId]: session.id },
        }));
        try {
            const response = await api.chat.messages(session.id);
            const messages = Array.isArray(response) ? response : (response.messages || []);
            const mapped = mapSessionMessagesToChatMessages(messages);
            useStudioStore.setState((state) => ({
                chats: {
                    ...state.chats,
                    [performerId]: mapped,
                },
            }));
            useStudioStore.getState().setSessionMessages(session.id, mapped);
            if (!useStudioStore.getState().seEntities[session.id]) {
                useStudioStore.getState().upsertSession({
                    id: session.id,
                    title: session.title,
                    status: { type: 'idle' },
                });
            }
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
        const {
            focusSnapshot: currentFocusSnapshot,
            focusedPerformerId: currentFocusedId,
            focusedNodeType: currentFocusedNodeType,
        } = useStudioStore.getState();
        closeEditor();
        const shouldSwitchFocus = currentFocusSnapshot && (
            currentFocusedId !== performerId
            || currentFocusedNodeType !== 'performer'
        )
        if (shouldSwitchFocus) {
            switchFocusTarget(performerId, 'performer');
        } else {
            selectPerformer(performerId);
        }
        selectPerformerSession(session.id);
        setActiveChatPerformer(performerId);
        revealCanvasNode(performerId, 'performer');
    };

    const openAct = useCallback((actId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            focusedPerformerId: currentFocusedId,
            focusedNodeType: currentFocusedNodeType,
            acts: currentActs,
        } = useStudioStore.getState();

        // Auto-unhide act when clicking it in the sidebar
        const actEntry = currentActs.find((a) => a.id === actId);
        if (actEntry?.hidden) {
            useStudioStore.setState((s) => ({
                acts: s.acts.map((a) => (a.id === actId ? { ...a, hidden: false } : a)),
            }));
        }

        closeEditor();
        const shouldSwitchFocus = currentFocusSnapshot && (
            currentFocusedId !== actId
            || currentFocusedNodeType !== 'act'
        )
        if (shouldSwitchFocus) {
            switchFocusTarget(actId, 'act');
        } else {
            selectAct(actId);
        }
        revealCanvasNode(actId, 'act');
    }, [closeEditor, revealCanvasNode, selectAct, switchFocusTarget]);

    return (
        <div className="explorer explorer--stacked">
            <WorkspaceExplorerWorkspacesSection
                workspacesHeight={workspacesHeight}
                workspaceRows={workspaceRows}
                workingDir={workingDir}
                onOpenWorkspace={newWorkspace}
            />

            <div className="explorer__divider" onMouseDown={onDividerMouseDown} />

            <WorkspaceExplorerThreadsSection
                workspaceId={workspaceId}
                acts={acts}
                threadRows={threadRows}
                expandedRows={expandedRows}
                pendingDelete={pendingDelete}
                renamingSession={renamingSession}
                editingTarget={editingTarget}
                selectedActId={selectedActId}
                activeThreadId={activeThreadId}
                actThreads={actThreads}
                onToggleExpanded={toggleExpanded}
                onSetPendingDelete={setPendingDelete}
                onBeginRenamePerformerSession={beginRenamePerformerSession}
                onCommitRenameSession={commitRenameSession}
                onCancelRenameSession={cancelRenameSession}
                onSetRenamingValue={(value) => setRenamingSession((current) => current ? { ...current, value } : current)}
                performerSessionLabel={performerSessionLabel}
                onOpenPerformer={openPerformer}
                onOpenPerformerSession={openPerformerSession}
                onDeleteSession={deleteSession}
                onAddPerformer={() => addPerformer(`Performer ${sharedPerformers.length + 1}`)}
                onAddAct={() => useStudioStore.getState().addAct(`Act ${acts.length + 1}`)}
                onTogglePerformerVisibility={togglePerformerVisibility}
                onOpenPerformerEditor={openPerformerEditor}
                onSetActiveChatPerformer={setActiveChatPerformer}
                onRemovePerformer={removePerformer}
                onSavePerformerAsDraft={savePerformerAsDraft}
                onOpenAct={openAct}
                onCreateThread={async (actId) => {
                    await createThread(actId)
                }}

                onSaveActAsDraft={saveActAsDraft}
                onToggleActVisibility={toggleActVisibility}
                onRemoveAct={removeAct}
                onSelectThread={selectThread}
                onDeleteThread={deleteThread}
                onRenameThread={renameThread}
                onStartNewSession={(performerId) => void startNewSession(performerId)}
                onOpenActEditor={(actId) => openActEditor(actId)}
            />
        </div>
    );
}
