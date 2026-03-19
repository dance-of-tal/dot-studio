import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { useStudioStore } from '../../store';
import { mapSessionMessagesToChatMessages } from '../../lib/chat-messages';
import { parseStudioSessionTitle, renameStudioSessionTitle } from '../../../shared/session-metadata';
import {
    Folder,
    Trash2,
} from 'lucide-react';
import './StageExplorer.css';
import './StageExplorerItems.css';
import {
    stageLabel,
    buildPerformerSessionRows,
    groupPerformerSessionsById,
    buildThreadRows,
    LayerRow,
} from './stage-explorer-utils';
import type { ExplorerRenamingSession } from './stage-explorer-utils';
import StageExplorerStagesSection from './StageExplorerStagesSection';
import StageExplorerThreadsSection from './StageExplorerThreadsSection';


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
            <StageExplorerStagesSection
                stagesHeight={stagesHeight}
                stageRows={stageRows}
                workingDir={workingDir}
                onNewStage={newStage}
            />

            <div className="explorer__divider" onMouseDown={onDividerMouseDown} />

            <StageExplorerThreadsSection
                stageId={stageId}
                acts={acts}
                performers={performers}
                threadRows={threadRows}
                expandedRows={expandedRows}
                pendingDelete={pendingDelete}
                renamingSession={renamingSession}
                editingTarget={editingTarget}
                selectedActId={selectedActId}
                activeThreadId={activeThreadId}
                activeThreadParticipantKey={activeThreadParticipantKey}
                actThreads={actThreads}
                sharedPerformersLength={sharedPerformers.length}
                focusedPerformerId={focusedPerformerId}
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
                onSwitchFocusTarget={switchFocusTarget}
                onSelectAct={selectAct}
                onCreateThread={async (actId) => {
                    await createThread(actId)
                }}

                onSaveActAsDraft={saveActAsDraft}
                onToggleActVisibility={toggleActVisibility}
                onRemoveAct={removeAct}
                onSelectThread={selectThread}
                onSelectThreadParticipant={selectThreadParticipant}
            />
        </div>
    );
}
