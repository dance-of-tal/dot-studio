import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { ReactFlow, Background, ConnectionMode } from '@xyflow/react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../../store';
import { resolvePerformerRuntimeConfig } from '../../lib/performers';
import { usePreventBrowserZoom } from '../../hooks/usePreventBrowserZoom';
import CanvasControls from './CanvasControls';
import CanvasDropOverlay from './CanvasDropOverlay';
import { getCanvasDropLabel } from './canvas-drop-label';
import { useCanvasFlowHandlers } from './useCanvasFlowHandlers';
import { useCanvasTransformTarget } from './useCanvasTransformTarget';
import { useCanvasFocusFit } from './useCanvasFocusFit';
import { useCanvasPresentation } from './useCanvasPresentation';
import { resolveFocusNodeId } from '../../lib/focus-utils';
import OffsetBezierEdge from './OffsetBezierEdge';

const ActInspectorPanel = lazy(() => import('../../features/act/ActInspectorPanel'));

const WorkspaceToolbar = lazy(() => import('../toolbar/WorkspaceToolbar'));
const AgentFrame = lazy(() =>
    import('../../features/performer').then((module) => ({ default: module.AgentFrame })),
);
const MarkdownEditorFrame = lazy(() => import('../../features/assets/MarkdownEditorFrame'));
const CanvasTerminalFrame = lazy(() => import('../../features/workspace/CanvasTerminalFrame'));
const CanvasTrackingFrame = lazy(() => import('../../features/workspace/CanvasTrackingFrame'));
const ActFrame = lazy(() => import('../../features/act/ActFrame'));

const withCanvasNodeSuspense = <TProps extends object>(Component: ComponentType<TProps>) => (props: TProps) => (
    <Suspense fallback={null}>
        <Component {...props} />
    </Suspense>
);

const nodeTypes = {
    performer: withCanvasNodeSuspense(AgentFrame),
    markdownEditor: withCanvasNodeSuspense(MarkdownEditorFrame),
    canvasTerminal: withCanvasNodeSuspense(CanvasTerminalFrame),
    stageTracking: withCanvasNodeSuspense(CanvasTrackingFrame),
    act: withCanvasNodeSuspense(ActFrame),
};

const edgeTypes = {
    offsetBezier: OffsetBezierEdge,
};

export default function CanvasArea() {
    const {
        performers,

        markdownEditors,
        canvasTerminals,
        trackingWindow,
        drafts,
        workingDir,
        focusedPerformerId,
        focusSnapshot,
        canvasRevealTarget,
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
        closeActEditor,
        openActEditor,
        setCanvasCenter,
        acts,
        actEditorState,
        selectedActId,
        selectAct,
        openActRelationEditor,
        updateActPosition,
        updateActSize,
        attachPerformerToAct,
        addRelation,
    } = useStudioStore();
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

    const {
        transformTarget,
        clearTransformTarget,
        activateTransformTarget,
        deactivateTransformTarget,
    } = useCanvasTransformTarget({
        acts,
        performers,
        markdownEditors,
        canvasTerminals,
        trackingWindow,
    })

    const performerMcpSummary = useCallback((performer: typeof performers[number]) => {
        const count = resolvePerformerRuntimeConfig(performer).mcpServerNames.length
        return count ? `${count} server${count === 1 ? '' : 's'}` : null
    }, [])
    const {
        nodes,
        onNodesChange,
        edges: relationEdges,
    } = useCanvasPresentation({
        acts,
        performers,
        markdownEditors,
        canvasTerminals,
        trackingWindow,
        drafts,
        workingDir,
        editingActId: actEditorState?.actId || null,
        selectedActId,
        selectedPerformerId,
        selectedMarkdownEditorId,
        focusedPerformerId,
        editingTarget,
        transformTarget,
        performerMcpSummary,
        onActivateTransform: activateTransformTarget,
        onDeactivateTransform: deactivateTransformTarget,
        onCloseTerminal: removeCanvasTerminal,
        onResizeTerminal: updateCanvasTerminalSize,
        onSessionChange: updateCanvasTerminalSession,
        onCloseTrackingWindow: closeTrackingWindow,
        onResizeTrackingWindow: updateTrackingWindowSize,
    })

    useCanvasFocusFit({
        focusedPerformerId,
        focusSnapshot,
        canvasRevealTarget,
        reactFlowInstance,
        nodeCount: nodes.length,
    })

    useEffect(() => {
        if (!focusSnapshot || !canvasAreaRef.current) {
            return
        }

        const focusNodeId = resolveFocusNodeId(focusSnapshot, focusedPerformerId)
        if (!focusNodeId) {
            return
        }

        const canvasElement = canvasAreaRef.current
        let frameId = 0

        const syncFocusedNodeSize = () => {
            frameId = 0
            const width = Math.round(canvasElement.clientWidth)
            const height = Math.round(canvasElement.clientHeight)

            if (!width || !height) {
                return
            }

            useStudioStore.setState((state) => {
                if (!state.focusSnapshot) {
                    return {}
                }

                if (state.focusSnapshot.type === 'performer') {
                    const performer = state.performers.find((entry) => entry.id === focusNodeId)
                    if (!performer || (performer.width === width && performer.height === height)) {
                        return {}
                    }
                    return {
                        performers: state.performers.map((entry) => (
                            entry.id === focusNodeId
                                ? { ...entry, width, height }
                                : entry
                        )),
                    }
                }

                const act = state.acts.find((entry) => entry.id === focusNodeId)
                if (!act || (act.width === width && act.height === height)) {
                    return {}
                }

                return {
                    acts: state.acts.map((entry) => (
                        entry.id === focusNodeId
                            ? { ...entry, width, height }
                            : entry
                    )),
                }
            })

            reactFlowInstance?.fitView({
                duration: 200,
                padding: 0,
                minZoom: 1,
                maxZoom: 1,
                nodes: [{ id: focusNodeId }],
            })
        }

        const scheduleSync = () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId)
            }
            frameId = window.requestAnimationFrame(syncFocusedNodeSize)
        }

        scheduleSync()
        const observer = new ResizeObserver(scheduleSync)
        observer.observe(canvasElement)

        return () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId)
            }
            observer.disconnect()
        }
    }, [focusSnapshot, focusedPerformerId, reactFlowInstance])

    const {
        onEdgeClick,
        onNodeDragStop,
        onNodeClick,
        onPaneClick,
        onConnect,
        handleNodesChange,
        onMoveEnd,
    } = useCanvasFlowHandlers({
        nodes,
        editingActId: actEditorState?.actId || null,
        editingTarget,
        reactFlowInstance,
        canvasAreaRef,
        transformTarget,
        clearTransformTarget,
        closeEditor,
        closeActEditor,
        openActEditor,
        openActRelationEditor,
        setCanvasCenter,
        selectMarkdownEditor,
        selectPerformer,
        setActiveChatPerformer,
        selectAct,
        attachPerformerToAct,
        addRelation,
        onNodesChange,
        updateMarkdownEditorPosition,
        updateCanvasTerminalPosition,
        updateTrackingWindowPosition,
        updateActPosition,
        updatePerformerPosition,
        updateActSize,
        updateMarkdownEditorSize,
        updateCanvasTerminalSize,
        updateTrackingWindowSize,
        updatePerformerSize,
    })

    const canvasDropLabel = getCanvasDropLabel(active?.data?.current?.kind)

    const isFocusActive = !!focusSnapshot

    return (
        <div className={`canvas-area ${isFocusActive ? 'canvas-area--focus' : ''}`} ref={setCanvasRefs}>
            <div className="canvas-top-right-bar">
                <CanvasControls />
                {!isFocusActive && (
                    <Suspense fallback={null}>
                        <WorkspaceToolbar />
                    </Suspense>
                )}
            </div>

            <CanvasDropOverlay active={isCanvasDropOver} label={canvasDropLabel} />
            <ReactFlow
                nodes={nodes}
                edges={relationEdges}
                onInit={setReactFlowInstance}
                onNodesChange={handleNodesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onConnect={onConnect}
                isValidConnection={() => true}
                connectionMode={ConnectionMode.Loose}
                onEdgeClick={onEdgeClick}
                onPaneClick={onPaneClick}
                onMoveEnd={onMoveEnd}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                multiSelectionKeyCode={null}
                selectionKeyCode={null}
                proOptions={{ hideAttribution: true }}
                fitView
                fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
                panOnDrag={!isFocusActive}
                zoomOnScroll={!isFocusActive}
                zoomOnPinch={!isFocusActive}
                zoomOnDoubleClick={!isFocusActive}
                nodesDraggable={!isFocusActive}
            >
                <Background color={isFocusActive ? 'transparent' : 'var(--border-strong)'} gap={16} size={1} />
            </ReactFlow>
            {actEditorState ? (
                <Suspense fallback={null}>
                    <ActInspectorPanel />
                </Suspense>
            ) : null}
        </div>
    );
}
