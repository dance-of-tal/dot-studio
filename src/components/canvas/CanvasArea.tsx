import { useCallback, useEffect, useState, useRef } from 'react';
import { ReactFlow, Background, useReactFlow, useNodesState } from '@xyflow/react';
import type { Node, NodeChange, ReactFlowInstance, Viewport } from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { Maximize, Minimize, Maximize2, Minimize2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../../store';
import AgentFrame from './AgentFrame';
import ActAreaFrame from './ActAreaFrame';
import MarkdownEditorFrame from './MarkdownEditorFrame';
import CanvasTerminalFrame from './CanvasTerminalFrame';
import CanvasTrackingFrame from './CanvasTrackingFrame';
import { hasModelConfig, resolvePerformerAgentId, resolvePerformerRuntimeConfig } from '../../lib/performers';
import { resolveActNodeLabel, resolveEffectiveActNodeSession } from '../../lib/acts';
import { computeActAutoLayout } from '../../lib/act-layout';
import { coerceStudioApiError } from '../../lib/api-errors';
import { showToast } from '../../lib/toast';
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
    actArea: ActAreaFrame,
    markdownEditor: MarkdownEditorFrame,
    canvasTerminal: CanvasTerminalFrame,
    stageTracking: CanvasTrackingFrame,
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
        createMarkdownEditor,
        actChats,
        actSessionMap,
        actSessions,
        selectedActId,
        focusedActId,
        focusedPerformerId,
        selectedActSessionId,
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
        updateActMeta,
        updateActBounds,
        addActNode,
        updateActNode,
        updateActNodePosition,
        setActNodeType,
        removeActNode,
        addActEdge,
        updateActEdge,
        removeActEdge,
        selectedPerformerId,
        selectMarkdownEditor,
        selectPerformer,
        selectAct,
        selectActSession,
        setActiveChatPerformer,
        sendActMessage,
        abortAct,
        startNewActSession,
        loadingActId,
        inspectorFocus,
        updatePerformerName,
        setPerformerDanceDeliveryMode,
        setPerformerModel,
        setPerformerModelVariant,
        setPerformerAgentId,
        removePerformerDance,
        removePerformerMcp,
        setInspectorFocus,
        closeEditor,
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

    // Sync from store to local state when performers change
    useEffect(() => {
        const actNodes = acts.map((act) => {
            const currentSessionId = (act.id === selectedActId ? selectedActSessionId : null) || actSessionMap[act.id] || null;
            const currentSession = currentSessionId
                ? actSessions.find((session) => session.id === currentSessionId) || null
                : null;
            const focusedNodeId = inspectorFocus?.startsWith('act-node:') ? inspectorFocus.slice('act-node:'.length) : null;
            const isActSelected = act.id === selectedActId;
            const isActFocused = focusedActId === act.id;
            const isActTransforming = transformTarget?.type === 'actArea' && transformTarget.id === act.id;
            const isActEditing = editingTarget?.type === 'act' && editingTarget.id === act.id;
            return ({
                id: act.id,
                type: 'actArea',
                position: { x: act.bounds.x, y: act.bounds.y },
                selected: isActSelected,
                draggable: true,
                dragHandle: '.figma-frame__header',
                hidden: act.hidden,
                zIndex: getCanvasWindowZIndex({
                    selected: isActSelected,
                    focused: isActFocused,
                    editing: isActEditing,
                    transformActive: isActTransforming,
                }),
                data: {
                    threadMode: !isActEditing,
                    focused: isActFocused,
                    name: act.name,
                    description: act.description,
                    width: act.bounds.width,
                    height: act.bounds.height,
                    maxIterations: act.maxIterations,
                    sessionTitle: currentSession?.title || null,
                    sessionStatus: currentSession?.status || null,
                    threadMessages: currentSessionId ? (actChats[currentSessionId] || []) : [],
                    runtimeSummary: currentSession?.resumeSummary || null,
                    loading: loadingActId === act.id,
                    entryNodeId: act.entryNodeId,
                    sessionMode: act.sessionMode || 'all_nodes_thread',
                    transformActive: isActTransforming,
                    onActivateTransform: () => activateTransformTarget('actArea', act.id),
                    onDeactivateTransform: () => deactivateTransformTarget('actArea', act.id),
                    editMode: isActEditing,
                    focusedNodeId,
                    onUpdateName: (name: string) => updateActMeta(act.id, { name }),
                    onUpdateDescription: (description: string) => updateActMeta(act.id, { description }),
                    onUpdateMaxIterations: (maxIterations: number) => updateActMeta(act.id, { maxIterations }),
                    onUpdateSessionMode: (sessionMode: 'default' | 'all_nodes_thread') => updateActMeta(act.id, { sessionMode }),
                    onResizeFrame: (width: number, height: number) => updateActBounds(act.id, {
                        width: Math.round(width),
                        height: Math.round(height),
                    }),
                    onFocusNode: (nodeId: string | null) => setInspectorFocus(nodeId ? `act-node:${nodeId}` : null),
                    onAddNode: (type: 'worker' | 'orchestrator' | 'parallel') => addActNode(act.id, type),
                    onAutoArrange: async () => {
                        try {
                            const layout = await computeActAutoLayout(act);
                            useStudioStore.getState().applyActAutoLayout(act.id, layout.positions, layout.bounds);
                        } catch (error) {
                            console.warn('[act-layout] auto arrange failed', error);
                            showToast(coerceStudioApiError(error).message, 'error', {
                                title: 'Auto arrange failed',
                                dedupeKey: `act-layout:${act.id}`,
                            });
                        }
                    },
                    onUpdateNode: (nodeId: string, patch: Record<string, unknown>) => updateActNode(act.id, nodeId, patch),
                    onSetNodeType: (nodeId: string, type: 'worker' | 'orchestrator' | 'parallel') => setActNodeType(act.id, nodeId, type),
                    onRemoveNode: (nodeId: string) => removeActNode(act.id, nodeId),
                    onEditAct: () => useStudioStore.getState().openActEditor(act.id, 'act-structure'),
                    onCloseEdit: () => closeEditor(),
                    onSend: (message: string) => sendActMessage(act.id, message),
                    onStop: () => abortAct(act.id),
                    onNewSession: () => {
                        startNewActSession(act.id);
                        selectActSession(null);
                    },
                    performerDetailsById: Object.fromEntries(
                        performers.map((performer) => [
                            performer.id,
                            {
                                id: performer.id,
                                name: performer.name,
                                talLabel: assetRefLabel(performer.talRef, drafts),
                                danceSummary: danceSummaryLabel(performer.danceRefs, drafts),
                                modelLabel: performer.model?.modelId || null,
                                agentLabel: resolvePerformerAgentId(performer),
                                mcpSummary: resolvePerformerRuntimeConfig(performer).mcpServerNames.length ? `${resolvePerformerRuntimeConfig(performer).mcpServerNames.length} server${resolvePerformerRuntimeConfig(performer).mcpServerNames.length === 1 ? '' : 's'}` : null,
                                planMode: !!performer.planMode,
                                scope: performer.scope,
                            },
                        ]),
                    ),
                    performersById: Object.fromEntries(
                        performers.map((performer) => [performer.id, performer]),
                    ),
                    onCreatePerformerForNode: (nodeId: string, seededAsset?: Record<string, unknown> | null) =>
                        useStudioStore.getState().createActOwnedPerformerForNode(act.id, nodeId, seededAsset || null),
                    onCreateTalDraft: (performerId: string) => createMarkdownEditor('tal', {
                        attachTarget: {
                            performerId,
                            mode: 'tal',
                        },
                    }),
                    onCreateDanceDraft: (performerId: string) => createMarkdownEditor('dance', {
                        attachTarget: {
                            performerId,
                            mode: 'dance-new',
                        },
                    }),
                    onUpdatePerformerName: (performerId: string, name: string) => updatePerformerName(performerId, name),
                    onUpdatePerformerDanceDeliveryMode: (performerId: string, mode: 'auto' | 'tool' | 'inline') => setPerformerDanceDeliveryMode(performerId, mode),
                    onSetPerformerModel: (performerId: string, model: { provider: string; modelId: string } | null) => setPerformerModel(performerId, model),
                    onSetPerformerModelVariant: (performerId: string, variant: string | null) => setPerformerModelVariant(performerId, variant),
                    onSetPerformerAgentId: (performerId: string, agentId: string | null) => setPerformerAgentId(performerId, agentId),
                    onRemovePerformerDance: (performerId: string, danceRefKey: string) => removePerformerDance(performerId, danceRefKey),
                    onRemovePerformerMcp: (performerId: string, serverName: string) => removePerformerMcp(performerId, serverName),
                    edges: act.edges,
                    onAddEdge: () => addActEdge(act.id),
                    onUpdateEdge: (edgeId: string, patch: Record<string, unknown>) => updateActEdge(act.id, edgeId, patch),
                    onNodeMove: (nodeId: string, x: number, y: number) => updateActNodePosition(act.id, nodeId, x, y),
                    onConnectNodes: (from: string, to: string) => addActEdge(act.id, from, to),
                    onRemoveEdge: (edgeId: string) => removeActEdge(act.id, edgeId),
                    onSetEntry: (nodeId: string) => updateActMeta(act.id, { entryNodeId: nodeId }),
                    entryLabel: (() => {
                        const entryNode = act.nodes.find((node) => node.id === act.entryNodeId) || null
                        return entryNode ? resolveActNodeLabel(entryNode as any, performers) : null
                    })(),
                    nodes: act.nodes.map((node) => {
                        const effectiveSession = node.type === 'parallel'
                            ? null
                            : resolveEffectiveActNodeSession(act, node)
                        return {
                            id: node.id,
                            type: node.type,
                            position: node.position,
                            label: resolveActNodeLabel(node, performers),
                            entry: act.entryNodeId === node.id,
                            sessionPolicy: effectiveSession?.policy || null,
                            sessionLifetime: effectiveSession?.lifetime || null,
                            sessionModeOverride: node.type === 'parallel' ? null : !!node.sessionModeOverride,
                            modelVariant: node.type === 'parallel' ? null : (node.modelVariant || null),
                            performerId: node.type === 'parallel' ? null : node.performerId,
                            performerName: node.type === 'parallel'
                                ? null
                                : performers.find((performer) => performer.id === node.performerId)?.name || null,
                            performerSummary: node.type === 'parallel'
                                ? 'Parallel branch node'
                                : (() => {
                                    const performer = performers.find((item) => item.id === node.performerId);
                                    if (!performer) return 'Unassigned performer';
                                    const parts = [
                                        assetRefLabel(performer.talRef, drafts),
                                        danceSummaryLabel(performer.danceRefs, drafts),
                                        performer.model?.modelId || null,
                                    ].filter(Boolean);
                                    return parts.join(' · ') || 'No prompt assets yet';
                                })(),
                        }
                    }),
                } as Record<string, unknown>,
            })
        })
        const performerNodes = performers.map(a => ({
            id: a.id,
            type: 'performer',
            position: a.position,
            selected: a.id === selectedPerformerId,
            dragHandle: '.figma-frame__header',
            hidden: a.hidden,
            zIndex: getCanvasWindowZIndex({
                selected: a.id === selectedPerformerId,
                focused: focusedPerformerId === a.id,
                editing: editingTarget?.type === 'performer' && editingTarget.id === a.id,
                transformActive: transformTarget?.type === 'performer' && transformTarget.id === a.id,
            }),
            data: {
                name: a.name,
                width: a.width,
                height: a.height,
                model: a.model,
                modelLabel: a.model?.modelId || null,
                modelTitle: a.model ? `${a.model.provider}/${a.model.modelId}` : null,
                modelVariant: a.modelVariant || null,
                agentId: a.agentId || null,
                modelConfigured: hasModelConfig(a.model),
                planMode: a.planMode,
                transformActive: transformTarget?.type === 'performer' && transformTarget.id === a.id,
                onActivateTransform: () => activateTransformTarget('performer', a.id),
                onDeactivateTransform: () => deactivateTransformTarget('performer', a.id),
                talLabel: assetRefLabel(a.talRef, drafts),
                danceSummary: danceSummaryLabel(a.danceRefs, drafts),
                mcpSummary: resolvePerformerRuntimeConfig(a).mcpServerNames.length ? `${resolvePerformerRuntimeConfig(a).mcpServerNames.length} server${resolvePerformerRuntimeConfig(a).mcpServerNames.length === 1 ? '' : 's'}` : null,
                editMode: editingTarget?.type === 'performer' && editingTarget.id === a.id,
            } as Record<string, unknown>
        }));
        const markdownEditorNodes = markdownEditors.map((editor) => ({
            id: editor.id,
            type: 'markdownEditor',
            position: editor.position,
            selected: editor.id === selectedMarkdownEditorId,
            dragHandle: '.figma-frame__header',
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
        }));
        const canvasTerminalNodes = canvasTerminals.map((ct) => ({
            id: ct.id,
            type: 'canvasTerminal',
            position: ct.position,
            dragHandle: '.figma-frame__header',
            zIndex: getCanvasWindowZIndex({
                transformActive: transformTarget?.type === 'canvasTerminal' && transformTarget.id === ct.id,
            }),
            data: {
                nodeId: ct.id,
                title: ct.title,
                width: ct.width,
                height: ct.height,
                onClose: () => removeCanvasTerminal(ct.id),
                onResize: (w: number, h: number) => updateCanvasTerminalSize(ct.id, w, h),
                onSessionChange: (sessionId: string | null, connected: boolean) => updateCanvasTerminalSession(ct.id, sessionId, connected),
            } as Record<string, unknown>,
        }));
        const trackingNodes = trackingWindow ? [{
            id: trackingWindow.id,
            type: 'stageTracking',
            position: trackingWindow.position,
            dragHandle: '.figma-frame__header',
            zIndex: getCanvasWindowZIndex({
                transformActive: transformTarget?.type === 'stageTracking' && transformTarget.id === trackingWindow.id,
            }),
            data: {
                title: trackingWindow.title,
                width: trackingWindow.width,
                height: trackingWindow.height,
                onClose: () => closeTrackingWindow(),
                onResize: (w: number, h: number) => updateTrackingWindowSize(w, h),
            } as Record<string, unknown>,
        }] : [];
        setNodes([...actNodes, ...performerNodes, ...markdownEditorNodes, ...canvasTerminalNodes, ...trackingNodes]);
    }, [performers, acts, markdownEditors, canvasTerminals, trackingWindow, drafts, selectedActId, focusedActId, selectedActSessionId, selectedMarkdownEditorId, selectedPerformerId, actChats, actSessionMap, actSessions, loadingActId, setNodes, workingDir, editingTarget, inspectorFocus, transformTarget, activateTransformTarget, deactivateTransformTarget, updateActMeta, setInspectorFocus, addActNode, updateActNode, setActNodeType, removeActNode, closeEditor, updatePerformerName, setPerformerDanceDeliveryMode, setPerformerModel, setPerformerAgentId, removePerformerDance, removePerformerMcp, setActiveChatPerformer, updateActBounds, updateActEdge, updateActNodePosition, addActEdge, removeActEdge, sendActMessage, abortAct, startNewActSession, selectActSession, removeCanvasTerminal, closeTrackingWindow, updateCanvasTerminalSize, updateCanvasTerminalSession, updateTrackingWindowSize]);

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
        <div className="figma-canvas-area" ref={setCanvasRefs}>
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
                edges={[]}
                onInit={setReactFlowInstance}
                onNodesChange={handleNodesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
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
