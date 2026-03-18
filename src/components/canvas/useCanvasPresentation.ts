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
import { buildActLayoutNodes, isActLayoutActive } from './act-layout-helpers'
import { composeCanvasEdges } from './canvas-edge-composer'
import { composeCanvasNodes } from './canvas-node-composer'
import {
    buildActCanvasNodes,
    buildCanvasTerminalWindowNodes,
    buildMarkdownEditorCanvasNodes,
    buildPerformerCanvasNodes,
    buildTrackingWindowNodes,
} from './canvas-window-node-builders'

type CanvasNodeKind = 'performer' | 'markdownEditor' | 'canvasTerminal' | 'stageTracking' | 'act' | 'act-participant'

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
    layoutActId: string | null
    focusedPerformerId: string | null
    editingTarget: { type: string; id: string } | null
    focusSnapshotType: string | undefined
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
        layoutActId,
        focusedPerformerId,
        editingTarget,
        focusSnapshotType,
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

    const isActLayoutMode = isActLayoutActive(focusSnapshotType, layoutActId)
    const layoutAct = useMemo(
        () => (isActLayoutMode && layoutActId ? acts.find((act) => act.id === layoutActId) || null : null),
        [isActLayoutMode, layoutActId, acts],
    )

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
        layoutActId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    }), [
        acts,
        selectedActId,
        layoutActId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    ])

    const buildActParticipantNodes = useCallback(() => {
        if (!isActLayoutMode || !layoutActId) return []
        return buildActLayoutNodes(layoutAct, layoutActId)
    }, [isActLayoutMode, layoutActId, layoutAct])

    useEffect(() => {
        setNodes(composeCanvasNodes({
            isActLayoutMode,
            actLayoutNodes: buildActParticipantNodes(),
            performerNodes: buildPerformerNodes(),
            markdownEditorNodes: buildMarkdownEditorNodes(),
            canvasTerminalNodes: buildCanvasTerminalNodes(),
            trackingNodes: buildTrackingNodes(),
            actNodes: buildActNodes(),
        }))
    }, [
        isActLayoutMode,
        buildActParticipantNodes,
        buildPerformerNodes,
        buildMarkdownEditorNodes,
        buildCanvasTerminalNodes,
        buildTrackingNodes,
        buildActNodes,
        setNodes,
    ])

    const edges = useMemo(
        () => composeCanvasEdges(isActLayoutMode, layoutAct),
        [isActLayoutMode, layoutAct],
    )

    return {
        nodes,
        setNodes,
        onNodesChange,
        edges,
        isActLayoutMode,
        layoutAct,
    }
}
