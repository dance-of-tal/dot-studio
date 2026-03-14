import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { ReactFlow, Background, useReactFlow, useNodesState } from '@xyflow/react';
import type { Node, NodeChange, ReactFlowInstance, Viewport, Edge, Connection } from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { Maximize, Minimize, Maximize2, Minimize2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../../store';
import { AgentFrame } from '../../features/performer';
// ActAreaFrame removed (Phase 2 pending)
import MarkdownEditorFrame from '../../features/assets/MarkdownEditorFrame';
import CanvasTerminalFrame from '../../features/workspace/CanvasTerminalFrame';
import CanvasTrackingFrame from '../../features/workspace/CanvasTrackingFrame';
import { hasModelConfig, resolvePerformerRuntimeConfig } from '../../lib/performers';
// resolveActNodeLabel, computeActAutoLayout removed (Phase 2 pending)
import { usePreventBrowserZoom } from '../../hooks/usePreventBrowserZoom';
import StageToolbar from '../toolbar/StageToolbar';
import RelationEdge from '../../features/act/RelationEdge';

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
};

const edgeTypes = {
    relation: RelationEdge,
};

type CanvasNodeKind = 'performer' | 'actArea' | 'markdownEditor' | 'canvasTerminal' | 'stageTracking';

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

    const { selectedPerformerId, focusedPerformerId, setFocusedPerformer, selectedActId, focusedActId, setFocusedAct, editingTarget } = useStudioStore();

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
        if (editingTarget?.type === 'act') {
            return;
        }
        if (focusedPerformerId || focusedActId) {
            setFocusedPerformer(null);
            setFocusedAct(null);
            setTimeout(() => {
                fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
            }, 50);
        } else if (selectedPerformerId) {
            setFocusedPerformer(selectedPerformerId);
            setTimeout(() => {
                fitView({ duration: 400, padding: 0.15, minZoom: 1, maxZoom: 1, nodes: [{ id: selectedPerformerId }] });
            }, 60);
        } else if (selectedActId) {
            setFocusedAct(selectedActId);
            setTimeout(() => {
                fitView({ duration: 400, padding: 0.15, minZoom: 1, maxZoom: 1, nodes: [{ id: selectedActId }] });
            }, 60);
        }
    }, [editingTarget, focusedActId, focusedPerformerId, selectedActId, selectedPerformerId, setFocusedAct, setFocusedPerformer, fitView]);

    return (
        <div className="canvas-controls">
            <button className="canvas-controls__btn" onClick={() => zoomIn({ duration: 200 })} title="Zoom In">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <button className="canvas-controls__btn" onClick={() => zoomOut({ duration: 200 })} title="Zoom Out">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            {(selectedPerformerId || selectedActId) && editingTarget?.type !== 'act' && (
                <button className="canvas-controls__btn" onClick={toggleFocus} title={(focusedPerformerId || focusedActId) ? "Exit Focus Mode" : selectedActId ? "Focus Selected Act" : "Focus Selected Performer"}>
                    {(focusedPerformerId || focusedActId) ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            )}
            <button className="canvas-controls__btn" onClick={toggleFitView} title={isFitted ? "Restore View" : "Fit to Screen"}>
                {isFitted ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
        </div>
    );
}

export default function CanvasArea() {
    const {
        performers,
        acts,
        markdownEditors,
        canvasTerminals,
        trackingWindow,
        drafts,
        workingDir,
        focusedActId,
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
        updateActBounds,
        selectedPerformerId,
        selectMarkdownEditor,
        selectPerformer,
        selectAct,
        setActiveChatPerformer,
        closeEditor,
        addEdge: storeAddEdge,
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
            || (transformTarget.type === 'actArea' && acts.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'markdownEditor' && markdownEditors.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'canvasTerminal' && canvasTerminals.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'stageTracking' && trackingWindow?.id === transformTarget.id)
        );

        if (!exists) {
            setTransformTarget(null);
        }
    }, [acts, markdownEditors, performers, transformTarget, canvasTerminals, trackingWindow]);

    useEffect(() => {
        const focusNodeId = editingTarget?.type === 'act'
            ? editingTarget.id
            : focusedActId || focusedPerformerId || null;

        if (!reactFlowInstance || !focusNodeId) {
            return;
        }

        const timer = window.setTimeout(() => {
            reactFlowInstance.fitView({
                duration: 250,
                padding: editingTarget?.type === 'act' ? 0.12 : 0.15,
                minZoom: 1,
                maxZoom: 1,
                nodes: [{ id: focusNodeId }],
            });
        }, 80);

        return () => {
            window.clearTimeout(timer);
        };
    }, [editingTarget, focusedActId, focusedPerformerId, reactFlowInstance, nodes.length]);

    const performerMcpSummary = useCallback((performer: typeof performers[number]) => {
        const count = resolvePerformerRuntimeConfig(performer).mcpServerNames.length
        return count ? `${count} server${count === 1 ? '' : 's'}` : null
    }, [])



    // Act area nodes removed (Phase 2 pending — will be replaced by PerformerRelation edge model)
    const buildActAreaNodes = useCallback(() => [] as Node[], [])

    // Edges from store performer relations
    const edges = useStudioStore((s) => s.edges)
    const reactFlowEdges = useMemo<Edge[]>(() => edges.map((link) => ({
        id: link.id,
        source: link.from,
        target: link.to,
        type: 'relation',
        animated: true,
        data: {
            interaction: link.interaction || 'request',
            description: link.description || '',
        },
    })), [edges])

    const onConnect = useCallback((connection: Connection) => {
        if (connection.source && connection.target && connection.source !== connection.target) {
            storeAddEdge(connection.source, connection.target)
        }
    }, [storeAddEdge])

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

    // Sync from store to local state when performers change
    useEffect(() => {
        setNodes([
            ...buildActAreaNodes(),
            ...buildPerformerNodes(),
            ...buildMarkdownEditorNodes(),
            ...buildCanvasTerminalNodes(),
            ...buildTrackingNodes(),
        ]);
    }, [buildActAreaNodes, buildPerformerNodes, buildMarkdownEditorNodes, buildCanvasTerminalNodes, buildTrackingNodes, setNodes]);

    const onNodeDragStop = useCallback(
        (_: any, node: import('@xyflow/react').Node) => {
            if (node.type === 'actArea') {
                updateActBounds(node.id, {
                    x: Math.round(node.position.x),
                    y: Math.round(node.position.y),
                });
                return;
            }

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

            updatePerformerPosition(node.id, Math.round(node.position.x), Math.round(node.position.y));
        },
        [updateActBounds, updateMarkdownEditorPosition, updatePerformerPosition, updateCanvasTerminalPosition, updateTrackingWindowPosition]
    );

    const onNodeClick = useCallback(
        (event: React.MouseEvent, node: Node) => {
            const target = event.target as HTMLElement;
            if (target.closest('.canvas-drag-handle--interactive')) {
                return;
            }

            clearTransformTarget();
            if (node.type === 'actArea') {
                if (editingTarget && !(editingTarget.type === 'act' && editingTarget.id === node.id)) {
                    closeEditor();
                }
                selectAct(node.id);
                return;
            }
            if (node.type === 'markdownEditor') {
                const attachPerformerId = (node.data as any)?.attachTarget?.performerId || null;
                const attachedAct = attachPerformerId
                    ? acts.find((act) => act.nodes.some((item) => item.type !== 'parallel' && item.performerId === attachPerformerId)) || null
                    : null;
                if (!attachedAct) {
                    closeEditor();
                }
                selectMarkdownEditor(node.id);
                return;
            }
            if (node.type === 'canvasTerminal') {
                // Just clear other selections — no editor to open
                closeEditor();
                selectPerformer(null);
                selectAct(null);
                selectMarkdownEditor(null);
                return;
            }
            if (node.type === 'stageTracking') {
                closeEditor();
                selectPerformer(null);
                selectAct(null);
                selectMarkdownEditor(null);
                return;
            }
            if (editingTarget && !(editingTarget.type === 'performer' && editingTarget.id === node.id)) {
                closeEditor();
            }
            selectPerformer(node.id);
            setActiveChatPerformer(node.id);
        },
        [acts, clearTransformTarget, closeEditor, editingTarget, selectAct, selectMarkdownEditor, selectPerformer, setActiveChatPerformer]
    );

    const onPaneClick = useCallback(() => {
        clearTransformTarget();
        closeEditor();
        selectPerformer(null);
        selectAct(null);
        selectMarkdownEditor(null);
    }, [clearTransformTarget, closeEditor, selectAct, selectMarkdownEditor, selectPerformer]);

    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        // Filter out 'select' changes — selection is driven externally by Zustand selectedPerformerId
        const filtered = changes.filter(c => c.type !== 'select');
        onNodesChange(filtered);

        changes.forEach(c => {
            if (c.type === 'dimensions' && c.resizing === false && c.dimensions) {
                const changedNode = nodes.find((node) => node.id === c.id)
                if (changedNode?.type === 'actArea') {
                    updateActBounds(c.id, {
                        width: c.dimensions.width,
                        height: c.dimensions.height,
                    });
                    return;
                }

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
    }, [nodes, onNodesChange, updateActBounds, updateMarkdownEditorSize, updatePerformerSize, updateCanvasTerminalSize, updateTrackingWindowSize]);

    const canvasDropLabel = active?.data?.current?.kind === 'act'
        ? 'Drop to import this act into the current stage'
        : active?.data?.current?.kind === 'performer'
            ? 'Drop to add this performer to the current stage'
            : null;

    return (
        <div className="canvas-area" ref={setCanvasRefs}>
            <div className="canvas-top-right-bar">
                <CustomControls />
                <StageToolbar />
            </div>
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
                edges={reactFlowEdges}
                onInit={setReactFlowInstance}
                onNodesChange={handleNodesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                multiSelectionKeyCode={null}
                selectionKeyCode={null}
                proOptions={{ hideAttribution: true }}
                fitView
                fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
            >
                <Background color="var(--border-strong)" gap={16} size={1} />
            </ReactFlow>
        </div>
    );
}
