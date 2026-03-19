import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { ReactFlow, Background } from '@xyflow/react';
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

const ActInspectorPanel = lazy(() => import('../../features/act/ActInspectorPanel'));

const StageToolbar = lazy(() => import('../toolbar/StageToolbar'));
const AgentFrame = lazy(() =>
    import('../../features/performer').then((module) => ({ default: module.AgentFrame })),
);
const MarkdownEditorFrame = lazy(() => import('../../features/assets/MarkdownEditorFrame'));
const CanvasTerminalFrame = lazy(() => import('../../features/workspace/CanvasTerminalFrame'));
const CanvasTrackingFrame = lazy(() => import('../../features/workspace/CanvasTrackingFrame'));
const ActFrame = lazy(() => import('../../features/act/ActFrame'));

const withCanvasNodeSuspense = (Component: ComponentType<any>) => (props: any) => (
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

const edgeTypes = {};

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
        selectAct,
        updateActPosition,
        createActFromPerformers,
        attachPerformerToAct,
        selectActParticipant,
        selectRelation,
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
        reactFlowInstance,
        nodeCount: nodes.length,
    })

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
        editingTarget,
        reactFlowInstance,
        canvasAreaRef,
        clearTransformTarget,
        closeEditor,
        setCanvasCenter,
        selectMarkdownEditor,
        selectPerformer,
        setActiveChatPerformer,
        selectAct,
        selectActParticipant,
        selectRelation,
        createActFromPerformers,
        attachPerformerToAct,
        onNodesChange,
        updateMarkdownEditorPosition,
        updateCanvasTerminalPosition,
        updateTrackingWindowPosition,
        updateActPosition,
        updatePerformerPosition,
        updateMarkdownEditorSize,
        updateCanvasTerminalSize,
        updateTrackingWindowSize,
        updatePerformerSize,
    })

    const canvasDropLabel = getCanvasDropLabel(active?.data?.current?.kind)

    return (
        <div className={`canvas-area ${focusedPerformerId ? 'canvas-area--focus' : ''}`} ref={setCanvasRefs}>
            <div className="canvas-top-right-bar">
                <CanvasControls />
                <Suspense fallback={null}>
                    <StageToolbar />
                </Suspense>
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
                panOnDrag={!focusedPerformerId}
                zoomOnScroll={!focusedPerformerId}
                zoomOnPinch={!focusedPerformerId}
                zoomOnDoubleClick={!focusedPerformerId}
                nodesDraggable={!focusedPerformerId}
            >
                <Background color={focusedPerformerId ? 'transparent' : 'var(--border-strong)'} gap={16} size={1} />
            </ReactFlow>
            {selectedActId ? (
                <Suspense fallback={null}>
                    <ActInspectorPanel />
                </Suspense>
            ) : null}
        </div>
    );
}
