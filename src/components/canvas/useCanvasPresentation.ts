import { useCallback, useEffect, useMemo } from 'react'
import { useNodesState } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import type {
    CanvasTerminalNode,
    CanvasTrackingWindow,
    DraftAsset,
    MarkdownEditorNode,
    PerformerNode,
    StageAct,
} from '../../types'
import { composeCanvasEdges } from './canvas-edge-composer'
import { composeCanvasNodes } from './canvas-node-composer'
import {
    buildActCanvasNodes,
    buildCanvasTerminalWindowNodes,
    buildMarkdownEditorCanvasNodes,
    buildPerformerCanvasNodes,
    buildTrackingWindowNodes,
} from './canvas-window-node-builders'

type CanvasNodeKind = 'performer' | 'markdownEditor' | 'canvasTerminal' | 'stageTracking' | 'act'

type UseCanvasPresentationArgs = {
    acts: StageAct[]
    performers: PerformerNode[]
    markdownEditors: MarkdownEditorNode[]
    canvasTerminals: CanvasTerminalNode[]
    trackingWindow: CanvasTrackingWindow | null | undefined
    drafts: Record<string, DraftAsset>
    workingDir: string
    selectedActId: string | null
    selectedPerformerId: string | null
    selectedMarkdownEditorId: string | null
    focusedPerformerId: string | null
    editingTarget: { type: string; id: string } | null
    transformTarget: { id: string; type: CanvasNodeKind } | null
    performerMcpSummary: (performer: PerformerNode) => string | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
    onCloseTerminal: (id: string) => void
    onResizeTerminal: (id: string, width: number, height: number) => void
    onSessionChange: (id: string, sessionId: string | null, connected: boolean) => void
    onCloseTrackingWindow: () => void
    onResizeTrackingWindow: (width: number, height: number) => void
}

export function useCanvasPresentation(args: UseCanvasPresentationArgs) {
    const {
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
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
        onCloseTrackingWindow,
        onResizeTrackingWindow,
    } = args

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])

    const buildPerformerNodes = useCallback(() => buildPerformerCanvasNodes({
        performers,
        selectedPerformerId,
        focusedPerformerId,
        editingTarget,
        transformTarget,
        drafts,
        performerMcpSummary,
        onActivateTransform,
        onDeactivateTransform,
    }), [
        performers,
        selectedPerformerId,
        focusedPerformerId,
        editingTarget,
        transformTarget,
        drafts,
        performerMcpSummary,
        onActivateTransform,
        onDeactivateTransform,
    ])

    const buildMarkdownEditorNodes = useCallback(() => buildMarkdownEditorCanvasNodes({
        markdownEditors,
        selectedMarkdownEditorId,
        transformTarget,
        workingDir,
        onActivateTransform,
        onDeactivateTransform,
    }), [
        markdownEditors,
        selectedMarkdownEditorId,
        transformTarget,
        workingDir,
        onActivateTransform,
        onDeactivateTransform,
    ])

    const buildCanvasTerminalNodes = useCallback(() => buildCanvasTerminalWindowNodes({
        canvasTerminals,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
    }), [
        canvasTerminals,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
    ])

    const buildTrackingNodes = useCallback(() => buildTrackingWindowNodes({
        trackingWindow,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTrackingWindow,
        onResizeTrackingWindow,
    }), [
        trackingWindow,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTrackingWindow,
        onResizeTrackingWindow,
    ])

    const buildActNodes = useCallback(() => buildActCanvasNodes({
        acts,
        selectedActId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    }), [
        acts,
        selectedActId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    ])

    useEffect(() => {
        setNodes(composeCanvasNodes({
            performerNodes: buildPerformerNodes(),
            markdownEditorNodes: buildMarkdownEditorNodes(),
            canvasTerminalNodes: buildCanvasTerminalNodes(),
            trackingNodes: buildTrackingNodes(),
            actNodes: buildActNodes(),
        }))
    }, [
        buildPerformerNodes,
        buildMarkdownEditorNodes,
        buildCanvasTerminalNodes,
        buildTrackingNodes,
        buildActNodes,
        setNodes,
    ])

    const edges = useMemo(
        () => composeCanvasEdges(acts),
        [acts],
    )

    return {
        nodes,
        setNodes,
        onNodesChange,
        edges,
    }
}
