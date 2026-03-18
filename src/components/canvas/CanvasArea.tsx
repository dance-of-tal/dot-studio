import { useCallback, useRef, useState } from 'react';
import { ReactFlow, Background } from '@xyflow/react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../../store';
import { AgentFrame } from '../../features/performer';
import MarkdownEditorFrame from '../../features/assets/MarkdownEditorFrame';
import CanvasTerminalFrame from '../../features/workspace/CanvasTerminalFrame';
import CanvasTrackingFrame from '../../features/workspace/CanvasTrackingFrame';
import ActFrame from '../../features/act/ActFrame';
import ActParticipantFrame from '../../features/act/ActParticipantFrame';
import ActInspectorPanel from '../../features/act/ActInspectorPanel';
import ActLayoutToolbar from '../../features/act/ActLayoutToolbar';
// PerformerRelationEdge removed — edges now live inside Act layout mode only
import { resolvePerformerRuntimeConfig } from '../../lib/performers';
import { usePreventBrowserZoom } from '../../hooks/usePreventBrowserZoom';
import StageToolbar from '../toolbar/StageToolbar';
import CanvasControls from './CanvasControls';
import CanvasDropOverlay from './CanvasDropOverlay';
import { resolveActLayoutRelation, shouldHandleActLayoutConnection } from './act-layout-helpers';
import { getCanvasDropLabel } from './canvas-drop-label';
import { useCanvasFlowHandlers } from './useCanvasFlowHandlers';
import { useCanvasTransformTarget } from './useCanvasTransformTarget';
import { useCanvasFocusFit } from './useCanvasFocusFit';
import { useCanvasPresentation } from './useCanvasPresentation';

const nodeTypes = {
    performer: AgentFrame,
    markdownEditor: MarkdownEditorFrame,
    canvasTerminal: CanvasTerminalFrame,
    stageTracking: CanvasTrackingFrame,
    act: ActFrame,
    'act-participant': ActParticipantFrame,
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
        layoutActId,
        selectAct,
        updateActPosition,
        addRelation,
        createActFromPerformers,
        attachPerformerToAct,
        updateActParticipantPosition,
        selectActParticipant,
        selectRelation,
        focusSnapshot,
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
        isActLayoutMode,
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
        layoutActId,
        focusedPerformerId,
        editingTarget,
        focusSnapshotType: focusSnapshot?.type,
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
        isActLayoutMode,
        layoutActId,
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
        addRelation,
        createActFromPerformers,
        attachPerformerToAct,
        onNodesChange,
        updateMarkdownEditorPosition,
        updateCanvasTerminalPosition,
        updateTrackingWindowPosition,
        updateActPosition,
        updateActParticipantPosition,
        updatePerformerPosition,
        updateMarkdownEditorSize,
        updateCanvasTerminalSize,
        updateTrackingWindowSize,
        updatePerformerSize,
        resolveActLayoutRelation,
        shouldHandleActLayoutConnection,
    })

    const canvasDropLabel = getCanvasDropLabel(active?.data?.current?.kind, layoutActId)

    return (
        <div className={`canvas-area ${(focusedPerformerId || isActLayoutMode) ? 'canvas-area--focus' : ''}`} ref={setCanvasRefs}>
            <div className="canvas-top-right-bar">
                <CanvasControls />
                <StageToolbar />
            </div>
            {isActLayoutMode && <ActLayoutToolbar />}
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
                nodesDraggable={!focusedPerformerId || isActLayoutMode}
            >
                <Background color={focusedPerformerId ? 'transparent' : 'var(--border-strong)'} gap={16} size={1} />
            </ReactFlow>
            {(isActLayoutMode || selectedActId) && <ActInspectorPanel />}
        </div>
    );
}
