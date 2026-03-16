import { useCallback, useEffect, useState, useRef } from 'react';
import { ReactFlow, Background, useReactFlow, useNodesState } from '@xyflow/react';
import type { Connection, Edge, Node, NodeChange, ReactFlowInstance, Viewport } from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { Maximize, Minimize, Maximize2, Minimize2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../../store';
import { AgentFrame } from '../../features/performer';
import MarkdownEditorFrame from '../../features/assets/MarkdownEditorFrame';
import CanvasTerminalFrame from '../../features/workspace/CanvasTerminalFrame';
import CanvasTrackingFrame from '../../features/workspace/CanvasTrackingFrame';
import ActFrame from '../../features/act/ActFrame';
import ActPerformerFrame from '../../features/act/ActPerformerFrame';
import ActPerformerInspector from '../../features/act/ActPerformerInspector';
import ActInlineEditor from '../../features/act/ActInlineEditor';
// PerformerRelationEdge removed — edges now live inside Act edit mode only
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../../lib/performers';
import { usePreventBrowserZoom } from '../../hooks/usePreventBrowserZoom';
import StageToolbar from '../toolbar/StageToolbar';

function assetRefLabel(
    ref: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null | undefined,
    drafts: Record<string, { name?: string; slug?: string }>,
) {
    if (!ref) {
        return null;
    }
    if (ref.kind === 'draft') {
        const draft = drafts[ref.draftId];
        return draft?.name || draft?.slug || `Draft · ${ref.draftId.slice(0, 8)}`;
    }
    return ref.urn.split('/').pop() || ref.urn;
}

function danceSummaryLabel(
    refs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>,
    drafts: Record<string, { name?: string; slug?: string }>,
) {
    if (refs.length === 0) {
        return null;
    }

    const labels = refs
        .map((ref) => assetRefLabel(ref, drafts))
        .filter((label): label is string => !!label);

    if (labels.length === 0) {
        return `${refs.length} dance${refs.length === 1 ? '' : 's'}`;
    }

    return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0];
}

const nodeTypes = {
    performer: AgentFrame,
    markdownEditor: MarkdownEditorFrame,
    canvasTerminal: CanvasTerminalFrame,
    stageTracking: CanvasTrackingFrame,
    act: ActFrame,
    'act-performer': ActPerformerFrame,
};

const edgeTypes = {};

type CanvasNodeKind = 'performer' | 'markdownEditor' | 'canvasTerminal' | 'stageTracking' | 'act' | 'act-performer';

function getCanvasWindowZIndex({
    selected = false,
    focused = false,
    editing = false,
    transformActive = false,
}: {
    selected?: boolean
    focused?: boolean
    editing?: boolean
    transformActive?: boolean
}) {
    if (transformActive) return 80;
    if (editing) return 70;
    if (focused) return 60;
    if (selected) return 50;
    return 1;
}

function CustomControls() {
    const { fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow();
    const [isFitted, setIsFitted] = useState(false);
    const prevViewport = useRef<Viewport | null>(null);

    const { selectedPerformerId, focusedPerformerId, enterFocusMode, exitFocusMode, focusSnapshot, exitActEditFocus } = useStudioStore();

    const toggleFitView = useCallback(() => {
        if (isFitted && prevViewport.current) {
            setViewport(prevViewport.current, { duration: 400 });
            setIsFitted(false);
        } else {
            prevViewport.current = getViewport();
            fitView({ duration: 400, padding: 0.1, maxZoom: 1 });
            setIsFitted(true);
        }
    }, [isFitted, fitView, getViewport, setViewport]);

    const toggleFocus = useCallback(() => {
        if (focusedPerformerId) {
            exitFocusMode();
            setTimeout(() => {
                fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
            }, 50);
        } else if (selectedPerformerId) {
            // Calculate viewport size from the canvas area element
            const canvasEl = document.querySelector('.canvas-area');
            const rect = canvasEl?.getBoundingClientRect();
            const viewportSize = {
                width: rect?.width ?? 1200,
                height: rect?.height ?? 800,
            };
            enterFocusMode(selectedPerformerId, viewportSize);
        }
    }, [focusedPerformerId, selectedPerformerId, enterFocusMode, exitFocusMode, fitView]);

    // Escape key to exit focus mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // Act edit focus takes priority
                if (focusSnapshot?.type === 'act') {
                    exitActEditFocus();
                    setTimeout(() => {
                        fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
                    }, 50);
                    return;
                }
                if (focusedPerformerId) {
                    exitFocusMode();
                    setTimeout(() => {
                        fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
                    }, 50);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedPerformerId, exitFocusMode, focusSnapshot, exitActEditFocus, fitView]);

    return (
        <div className="canvas-controls">
            {!focusedPerformerId && (
                <>
                    <button className="canvas-controls__btn" onClick={() => zoomIn({ duration: 200 })} title="Zoom In">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    <button className="canvas-controls__btn" onClick={() => zoomOut({ duration: 200 })} title="Zoom Out">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                </>
            )}
            {selectedPerformerId && (
                <button className="canvas-controls__btn" onClick={toggleFocus} title={focusedPerformerId ? "Exit Focus Mode" : "Focus Selected Performer"}>
                    {focusedPerformerId ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            )}
            {!focusedPerformerId && (
                <button className="canvas-controls__btn" onClick={toggleFitView} title={isFitted ? "Restore View" : "Fit to Screen"}>
                    {isFitted ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
            )}
        </div>
    );
}

export default function CanvasArea() {
    const {
        performers,

        markdownEditors,
        canvasTerminals,
        trackingWindow,
        drafts,
        workingDir,
        focusedPerformerId,
        selectedMarkdownEditorId,
        editingTarget,
        updatePerformerPosition,
        updatePerformerSize,
        updateMarkdownEditorPosition,
        updateMarkdownEditorSize,
        updateCanvasTerminalPosition,
        updateCanvasTerminalSize,
        updateCanvasTerminalSession,
        removeCanvasTerminal,
        closeTrackingWindow,
        updateTrackingWindowPosition,
        updateTrackingWindowSize,
        selectedPerformerId,
        selectMarkdownEditor,
        selectPerformer,
        setActiveChatPerformer,

        closeEditor,
        setCanvasCenter,
        acts,
        selectedActId,
        editingActId,
        selectAct,
        updateActPosition,
        enterActEditFocus,
        exitActEditFocus,
        addRelationInAct,
        updateActPerformerPosition,
        selectedActPerformerKey,
        selectActPerformer,
        focusSnapshot,
    } = useStudioStore();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [transformTarget, setTransformTarget] = useState<{ id: string; type: CanvasNodeKind } | null>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<Node> | null>(null);
    const { active, isOver: isCanvasDropOver, setNodeRef: setCanvasDropRef } = useDroppable({
        id: 'canvas-root-dropzone',
        data: {
            type: 'canvas-root',
        },
    });

    // Prevent Ctrl+wheel / pinch-to-zoom from zooming the browser viewport.
    // Only the canvas should respond to zoom gestures.
    const canvasAreaRef = useRef<HTMLDivElement | null>(null);
    usePreventBrowserZoom(canvasAreaRef);
    const setCanvasRefs = useCallback((node: HTMLDivElement | null) => {
        canvasAreaRef.current = node;
        setCanvasDropRef(node);
    }, [setCanvasDropRef]);

    const clearTransformTarget = useCallback(() => {
        setTransformTarget(null);
    }, []);

    const activateTransformTarget = useCallback((type: CanvasNodeKind, id: string) => {
        setTransformTarget({ type, id });
    }, []);

    const deactivateTransformTarget = useCallback((type: CanvasNodeKind, id: string) => {
        setTransformTarget((current) => (
            current && current.type === type && current.id === id
                ? null
                : current
        ));
    }, []);

    useEffect(() => {
        if (!transformTarget) {
            return;
        }

        const exists = (
            (transformTarget.type === 'performer' && performers.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'markdownEditor' && markdownEditors.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'canvasTerminal' && canvasTerminals.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'stageTracking' && trackingWindow?.id === transformTarget.id)
        );

        if (!exists) {
            setTransformTarget(null);
        }
    }, [markdownEditors, performers, transformTarget, canvasTerminals, trackingWindow]);

    useEffect(() => {
        const focusNodeId = focusedPerformerId || null;

        if (!reactFlowInstance || !focusNodeId) {
            return;
        }

        const timer = window.setTimeout(() => {
            reactFlowInstance.fitView({
                duration: 250,
                padding: 0.15,
                minZoom: 1,
                maxZoom: 1,
                nodes: [{ id: focusNodeId }],
            });
        }, 80);

        return () => {
            window.clearTimeout(timer);
        };
    }, [focusedPerformerId, reactFlowInstance, nodes.length]);

    const performerMcpSummary = useCallback((performer: typeof performers[number]) => {
        const count = resolvePerformerRuntimeConfig(performer).mcpServerNames.length
        return count ? `${count} server${count === 1 ? '' : 's'}` : null
    }, [])

    const buildPerformerNodes = useCallback(() => performers.map((performer) => ({
        id: performer.id,
        type: 'performer',
        position: performer.position,
        selected: performer.id === selectedPerformerId,
        dragHandle: '.canvas-frame__header',
        hidden: performer.hidden,
        zIndex: getCanvasWindowZIndex({
            selected: performer.id === selectedPerformerId,
            focused: focusedPerformerId === performer.id,
            editing: editingTarget?.type === 'performer' && editingTarget.id === performer.id,
            transformActive: transformTarget?.type === 'performer' && transformTarget.id === performer.id,
        }),
        data: {
            name: performer.name,
            width: performer.width,
            height: performer.height,
            model: performer.model,
            modelLabel: performer.model?.modelId || null,
            modelTitle: performer.model ? `${performer.model.provider}/${performer.model.modelId}` : null,
            modelVariant: performer.modelVariant || null,
            agentId: performer.agentId || null,
            modelConfigured: hasModelConfig(performer.model),
            planMode: performer.planMode,
            transformActive: transformTarget?.type === 'performer' && transformTarget.id === performer.id,
            onActivateTransform: () => activateTransformTarget('performer', performer.id),
            onDeactivateTransform: () => deactivateTransformTarget('performer', performer.id),
            talLabel: assetRefLabel(performer.talRef, drafts),
            danceSummary: danceSummaryLabel(performer.danceRefs, drafts),
            mcpSummary: performerMcpSummary(performer),
            editMode: editingTarget?.type === 'performer' && editingTarget.id === performer.id,
        } as Record<string, unknown>,
    })), [drafts, editingTarget, focusedPerformerId, performerMcpSummary, performers, selectedPerformerId, transformTarget, activateTransformTarget, deactivateTransformTarget])

    const buildMarkdownEditorNodes = useCallback(() => markdownEditors.map((editor) => ({
        id: editor.id,
        type: 'markdownEditor',
        position: editor.position,
        selected: editor.id === selectedMarkdownEditorId,
        dragHandle: '.canvas-frame__header',
        hidden: editor.hidden,
        zIndex: getCanvasWindowZIndex({
            selected: editor.id === selectedMarkdownEditorId,
            editing: selectedMarkdownEditorId === editor.id,
            transformActive: transformTarget?.type === 'markdownEditor' && transformTarget.id === editor.id,
        }),
        data: {
            kind: editor.kind,
            draftId: editor.draftId,
            baseline: editor.baseline,
            attachTarget: editor.attachTarget,
            width: editor.width,
            height: editor.height,
            transformActive: transformTarget?.type === 'markdownEditor' && transformTarget.id === editor.id,
            onActivateTransform: () => activateTransformTarget('markdownEditor', editor.id),
            onDeactivateTransform: () => deactivateTransformTarget('markdownEditor', editor.id),
            workingDir,
        } as Record<string, unknown>,
    })), [markdownEditors, selectedMarkdownEditorId, transformTarget, activateTransformTarget, deactivateTransformTarget, workingDir])

    const buildCanvasTerminalNodes = useCallback(() => canvasTerminals.map((terminal) => ({
        id: terminal.id,
        type: 'canvasTerminal',
        position: terminal.position,
        dragHandle: '.canvas-frame__header',
        zIndex: getCanvasWindowZIndex({
            transformActive: transformTarget?.type === 'canvasTerminal' && transformTarget.id === terminal.id,
        }),
        data: {
            nodeId: terminal.id,
            title: terminal.title,
            width: terminal.width,
            height: terminal.height,
            transformActive: transformTarget?.type === 'canvasTerminal' && transformTarget.id === terminal.id,
            onActivateTransform: () => activateTransformTarget('canvasTerminal', terminal.id),
            onDeactivateTransform: () => deactivateTransformTarget('canvasTerminal', terminal.id),
            onClose: () => removeCanvasTerminal(terminal.id),
            onResize: (width: number, height: number) => updateCanvasTerminalSize(terminal.id, width, height),
            onSessionChange: (sessionId: string | null, connected: boolean) => updateCanvasTerminalSession(terminal.id, sessionId, connected),
        } as Record<string, unknown>,
    })), [canvasTerminals, transformTarget, removeCanvasTerminal, updateCanvasTerminalSize, updateCanvasTerminalSession, activateTransformTarget, deactivateTransformTarget])

    const buildTrackingNodes = useCallback(() => trackingWindow ? [{
        id: trackingWindow.id,
        type: 'stageTracking',
        position: trackingWindow.position,
        dragHandle: '.canvas-frame__header',
        zIndex: getCanvasWindowZIndex({
            transformActive: transformTarget?.type === 'stageTracking' && transformTarget.id === trackingWindow.id,
        }),
        data: {
            title: trackingWindow.title,
            width: trackingWindow.width,
            height: trackingWindow.height,
            transformActive: transformTarget?.type === 'stageTracking' && transformTarget.id === trackingWindow.id,
            onActivateTransform: () => activateTransformTarget('stageTracking', trackingWindow.id),
            onDeactivateTransform: () => deactivateTransformTarget('stageTracking', trackingWindow.id),
            onClose: () => closeTrackingWindow(),
            onResize: (width: number, height: number) => updateTrackingWindowSize(width, height),
        } as Record<string, unknown>,
    }] : [], [trackingWindow, transformTarget, closeTrackingWindow, updateTrackingWindowSize, activateTransformTarget, deactivateTransformTarget])

    const buildActNodes = useCallback(() => acts.map((act) => ({
        id: act.id,
        type: 'act' as const,
        position: act.position,
        dragHandle: '.canvas-frame__header',
        zIndex: getCanvasWindowZIndex({
            selected: selectedActId === act.id,
            editing: editingActId === act.id,
            transformActive: transformTarget?.type === 'act' && transformTarget.id === act.id,
        }),
        data: {
            width: act.width,
            height: editingActId === act.id ? Math.max(400, act.height) : 80,
            transformActive: transformTarget?.type === 'act' && transformTarget.id === act.id,
            onActivateTransform: () => activateTransformTarget('act', act.id),
            onDeactivateTransform: () => deactivateTransformTarget('act', act.id),
        } as Record<string, unknown>,
    })), [acts, selectedActId, editingActId, transformTarget, activateTransformTarget, deactivateTransformTarget])

    const isActEditFocus = !!(focusSnapshot?.type === 'act' && editingActId)

    // Build act-internal performer nodes for Act edit focus mode
    const buildActPerformerNodes = useCallback(() => {
        if (!isActEditFocus || !editingActId) return []
        const act = acts.find((a) => a.id === editingActId)
        if (!act) return []
        return Object.entries(act.performers).map(([key, perf]) => ({
            id: `act-p-${key}`,
            type: 'act-performer' as const,
            position: perf.position,
            dragHandle: '.act-performer-card',
            data: { performerKey: key, actId: editingActId },
        }))
    }, [isActEditFocus, editingActId, acts])

    // Sync from store to local state when performers change
    useEffect(() => {
        if (isActEditFocus) {
            // In act edit focus, only show act-internal performer nodes
            setNodes(buildActPerformerNodes());
        } else {
            setNodes([
                ...buildPerformerNodes(),
                ...buildMarkdownEditorNodes(),
                ...buildCanvasTerminalNodes(),
                ...buildTrackingNodes(),
                ...buildActNodes(),
            ]);
        }
    }, [isActEditFocus, buildActPerformerNodes, buildPerformerNodes, buildMarkdownEditorNodes, buildCanvasTerminalNodes, buildTrackingNodes, buildActNodes, setNodes]);

    const relationEdges = useCallback((): Edge[] => {
        if (!isActEditFocus || !editingActId) return []
        const act = acts.find((a) => a.id === editingActId)
        if (!act) return []
        return act.relations.map((rel) => ({
            id: rel.id,
            source: `act-p-${rel.from}`,
            target: `act-p-${rel.to}`,
            type: 'default',
            animated: true,
            label: rel.description || undefined,
            style: { stroke: 'var(--accent)', strokeWidth: 2 },
        }))
    }, [isActEditFocus, editingActId, acts])


    const onNodeDragStop = useCallback(
        (_: any, node: import('@xyflow/react').Node) => {
            if (node.type === 'markdownEditor') {
                updateMarkdownEditorPosition(node.id, Math.round(node.position.x), Math.round(node.position.y));
                return;
            }

            if (node.type === 'canvasTerminal') {
                updateCanvasTerminalPosition(node.id, Math.round(node.position.x), Math.round(node.position.y));
                return;
            }
            if (node.type === 'stageTracking') {
                updateTrackingWindowPosition(Math.round(node.position.x), Math.round(node.position.y));
                return;
            }

            if (node.type === 'act') {
                updateActPosition(node.id, Math.round(node.position.x), Math.round(node.position.y));
                return;
            }

            if (node.type === 'act-performer' && editingActId) {
                const performerKey = node.id.replace(/^act-p-/, '')
                updateActPerformerPosition(editingActId, performerKey, Math.round(node.position.x), Math.round(node.position.y));
                return;
            }

            updatePerformerPosition(node.id, Math.round(node.position.x), Math.round(node.position.y));
        },
        [updateMarkdownEditorPosition, updatePerformerPosition, updateCanvasTerminalPosition, updateTrackingWindowPosition, updateActPosition, editingActId, updateActPerformerPosition]
    );

    const onNodeClick = useCallback(
        (event: React.MouseEvent, node: Node) => {
            const target = event.target as HTMLElement;
            if (target.closest('.canvas-drag-handle--interactive')) {
                return;
            }

            clearTransformTarget();
            if (node.type === 'markdownEditor') {
                closeEditor();
                selectMarkdownEditor(node.id);
                return;
            }
            if (node.type === 'canvasTerminal') {
                // Just clear other selections — no editor to open
                closeEditor();
                selectPerformer(null);
                selectMarkdownEditor(null);
                return;
            }
            if (node.type === 'stageTracking') {
                closeEditor();
                selectPerformer(null);
                selectMarkdownEditor(null);
                return;
            }
            if (node.type === 'act') {
                closeEditor();
                selectPerformer(null);
                selectMarkdownEditor(null);
                selectAct(node.id);
                return;
            }
            if (node.type === 'act-performer') {
                const performerKey = node.id.replace(/^act-p-/, '')
                selectActPerformer(performerKey)
                return;
            }
            if (editingTarget && !(editingTarget.type === 'performer' && editingTarget.id === node.id)) {
                closeEditor();
            }
            selectPerformer(node.id);
            setActiveChatPerformer(node.id);
        },
        [clearTransformTarget, closeEditor, editingTarget, selectMarkdownEditor, selectPerformer, setActiveChatPerformer, selectAct, selectActPerformer]
    );

    const onPaneClick = useCallback(() => {
        clearTransformTarget();
        closeEditor();
        selectPerformer(null);
        selectMarkdownEditor(null);
        // In Act edit focus, deselect act performer
        if (isActEditFocus) {
            selectActPerformer(null);
            return;
        }
        // Close Act edit mode when clicking on empty canvas
        if (editingActId) {
            useStudioStore.getState().toggleActEdit(editingActId);
        }
    }, [clearTransformTarget, closeEditor, selectMarkdownEditor, selectPerformer, editingActId, isActEditFocus, selectActPerformer]);

    const onConnect = useCallback((connection: Connection) => {
        if (isActEditFocus && editingActId && connection.source && connection.target) {
            const fromKey = connection.source.replace(/^act-p-/, '')
            const toKey = connection.target.replace(/^act-p-/, '')
            addRelationInAct(editingActId, fromKey, toKey)
        }
    }, [isActEditFocus, editingActId, addRelationInAct]);

    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        // Filter out 'select' changes — selection is driven externally by Zustand selectedPerformerId
        const filtered = changes.filter(c => c.type !== 'select');
        onNodesChange(filtered);

        changes.forEach(c => {
            if (c.type === 'dimensions' && c.resizing === false && c.dimensions) {
                const changedNode = nodes.find((node) => node.id === c.id)

                if (changedNode?.type === 'markdownEditor') {
                    updateMarkdownEditorSize(c.id, c.dimensions.width, c.dimensions.height);
                    return;
                }

                if (changedNode?.type === 'canvasTerminal') {
                    updateCanvasTerminalSize(c.id, c.dimensions.width, c.dimensions.height);
                    return;
                }
                if (changedNode?.type === 'stageTracking') {
                    updateTrackingWindowSize(c.dimensions.width, c.dimensions.height);
                    return;
                }

                updatePerformerSize(c.id, c.dimensions.width, c.dimensions.height);
            }
        });
    }, [nodes, onNodesChange, updateMarkdownEditorSize, updatePerformerSize, updateCanvasTerminalSize, updateTrackingWindowSize]);

    const canvasDropLabel = active?.data?.current?.kind === 'performer'
        ? 'Drop to add this performer to the current stage'
        : null;

    return (
        <div className={`canvas-area ${(focusedPerformerId || isActEditFocus) ? 'canvas-area--focus' : ''}`} ref={setCanvasRefs}>
            <div className="canvas-top-right-bar">
                <CustomControls />
                <StageToolbar />
            </div>
            {isActEditFocus && editingActId && (() => {
                const currentAct = acts.find(a => a.id === editingActId);
                const performerCount = currentAct ? Object.keys(currentAct.performers).length : 0;
                return (
                    <div className="act-edit-toolbar">
                        <div className="act-edit-toolbar__left">
                            <span className="act-edit-toolbar__icon">⚡</span>
                            <span className="act-edit-toolbar__name">{currentAct?.name || 'Act'}</span>
                            <span className="act-edit-toolbar__badge">{performerCount} performer{performerCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="act-edit-toolbar__right">
                            <button
                                className="act-edit-toolbar__btn"
                                onClick={() => {
                                    const name = `Performer ${performerCount + 1}`;
                                    useStudioStore.getState().addNewPerformerInAct(editingActId, name);
                                }}
                            >
                                + Add Performer
                            </button>
                            <button
                                className="act-edit-toolbar__btn act-edit-toolbar__btn--exit"
                                onClick={() => exitActEditFocus()}
                            >
                                Exit Edit
                            </button>
                        </div>
                    </div>
                );
            })()}
            {isActEditFocus && selectedActPerformerKey && (
                <ActPerformerInspector />
            )}
            {isActEditFocus && selectedActPerformerKey && (
                <ActInlineEditor />
            )}
            {canvasDropLabel && (
                <div className={`canvas-drop-overlay ${isCanvasDropOver ? 'is-active' : ''}`}>
                    <div className="canvas-drop-overlay__card">
                        <div className="canvas-drop-overlay__title">Canvas drop target</div>
                        <div className="canvas-drop-overlay__body">{canvasDropLabel}</div>
                    </div>
                </div>
            )}
            <ReactFlow
                nodes={nodes}
                edges={relationEdges()}
                onInit={setReactFlowInstance}
                onNodesChange={handleNodesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onConnect={onConnect}
                onPaneClick={onPaneClick}
                onMoveEnd={() => {
                    if (reactFlowInstance && canvasAreaRef.current) {
                        const rect = canvasAreaRef.current.getBoundingClientRect();
                        const center = reactFlowInstance.screenToFlowPosition({
                            x: rect.left + rect.width / 2,
                            y: rect.top + rect.height / 2,
                        });
                        setCanvasCenter(Math.round(center.x), Math.round(center.y));
                    }
                }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                multiSelectionKeyCode={null}
                selectionKeyCode={null}
                proOptions={{ hideAttribution: true }}
                fitView
                fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
                panOnDrag={!focusedPerformerId}
                zoomOnScroll={!focusedPerformerId}
                zoomOnPinch={!focusedPerformerId}
                zoomOnDoubleClick={!focusedPerformerId}
                nodesDraggable={!focusedPerformerId || isActEditFocus}
            >
                <Background color={focusedPerformerId ? 'transparent' : 'var(--border-strong)'} gap={16} size={1} />
            </ReactFlow>
        </div>
    );
}
