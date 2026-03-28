import { useCallback } from 'react'
import type { Connection, Node, NodeChange, ReactFlowInstance } from '@xyflow/react'
import type { WorkspaceSlice } from '../../store/types'
import type { WorkspaceActParticipantBinding, PerformerNode } from '../../types'
import { useStudioStore } from '../../store'
import { routeActConnection } from './act-connect-router'
import {
    resolveCanvasDragStop,
    resolveCanvasEdgeClick,
    resolveCanvasNodeClick,
} from './canvas-event-router'
import { resolveCanvasResizeChange } from './canvas-resize-router'

type EditingTargetLike = WorkspaceSlice['editingTarget']
type CanvasNodeKind = 'performer' | 'markdownEditor' | 'canvasTerminal' | 'stageTracking' | 'act'

type UseCanvasFlowHandlersArgs = {
    nodes: Node[]
    editingActId: string | null
    editingTarget: EditingTargetLike
    reactFlowInstance: ReactFlowInstance<Node> | null
    canvasAreaRef: React.RefObject<HTMLDivElement | null>
    transformTarget: { id: string; type: CanvasNodeKind } | null
    clearTransformTarget: () => void
    closeEditor: () => void
    closeActEditor: () => void
    openActEditor: (actId: string, mode?: 'act' | 'participant' | 'relation', options?: { participantKey?: string | null; relationId?: string | null }) => void
    openActRelationEditor: (actId: string, relationId: string) => void
    setCanvasCenter: (x: number, y: number) => void
    selectMarkdownEditor: (id: string | null) => void
    selectPerformer: (id: string | null) => void
    setActiveChatPerformer: (id: string | null) => void
    selectAct: (id: string | null) => void
    attachPerformerToAct: (actId: string, performerId: string) => string | null
    addRelation: (actId: string, between: [string, string], direction: 'both' | 'one-way') => string | null
    onNodesChange: (changes: NodeChange<Node>[]) => void
    updateMarkdownEditorPosition: (id: string, x: number, y: number) => void
    updateCanvasTerminalPosition: (id: string, x: number, y: number) => void
    updateTrackingWindowPosition: (x: number, y: number) => void
    updateActPosition: (id: string, x: number, y: number) => void
    updatePerformerPosition: (id: string, x: number, y: number) => void
    updateActSize: (id: string, width: number, height: number) => void
    updateMarkdownEditorSize: (id: string, width: number, height: number) => void
    updateCanvasTerminalSize: (id: string, width: number, height: number) => void
    updateTrackingWindowSize: (width: number, height: number) => void
    updatePerformerSize: (id: string, width: number, height: number) => void
}

export function useCanvasFlowHandlers(args: UseCanvasFlowHandlersArgs) {
    const {
        nodes,
        editingActId,
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
    } = args

    const onEdgeClick = useCallback((_event: React.MouseEvent, edge: import('@xyflow/react').Edge) => {
        if (!editingActId) return
        const relationId = resolveCanvasEdgeClick(edge)
        if (!relationId) return
        openActRelationEditor(editingActId, relationId)
    }, [editingActId, openActRelationEditor])

    const onNodeDragStop = useCallback((_: unknown, node: Node) => {
        const result = resolveCanvasDragStop(node)

        switch (result.kind) {
            case 'markdownEditor':
                updateMarkdownEditorPosition(result.id, result.x, result.y)
                return
            case 'canvasTerminal':
                updateCanvasTerminalPosition(result.id, result.x, result.y)
                return
            case 'stageTracking':
                updateTrackingWindowPosition(result.x, result.y)
                return
            case 'act':
                updateActPosition(result.id, result.x, result.y)
                return
            case 'performer':
                updatePerformerPosition(result.id, result.x, result.y)
                return
        }
    }, [
        updateMarkdownEditorPosition,
        updateCanvasTerminalPosition,
        updateTrackingWindowPosition,
        updateActPosition,
        updatePerformerPosition,
    ])

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        const result = resolveCanvasNodeClick(node, event.target, editingTarget)
        if (result.kind === 'ignore') {
            return
        }

        clearTransformTarget()

        switch (result.kind) {
            case 'markdownEditor':
                closeEditor()
                // Don't exit Act edit mode when clicking other canvas elements
                if (!editingActId) {
                    closeActEditor()
                }
                selectMarkdownEditor(result.id)
                return
            case 'canvasTerminal':
            case 'stageTracking':
                closeEditor()
                // Don't exit Act edit mode when clicking other canvas elements
                if (!editingActId) {
                    closeActEditor()
                }
                selectPerformer(null)
                selectMarkdownEditor(null)
                return
            case 'act':
                closeEditor()
                selectPerformer(null)
                selectMarkdownEditor(null)
                selectAct(result.id)
                return
            case 'performer':
                if (editingActId) {
                    // Stay in Act edit mode — just re-focus the Act
                    closeEditor()
                    selectAct(editingActId)
                    return
                }
                if (result.shouldCloseEditor) {
                    closeEditor()
                }
                closeActEditor()
                selectPerformer(result.id)
                setActiveChatPerformer(result.id)
                return
        }
    }, [
        editingTarget,
        editingActId,
        clearTransformTarget,
        closeEditor,
        closeActEditor,
        selectMarkdownEditor,
        selectPerformer,
        selectAct,
        setActiveChatPerformer,
    ])

    const onPaneClick = useCallback(() => {
        clearTransformTarget()
        closeEditor()
        // Don't exit Act edit mode on canvas click — only exit via explicit action
        if (!editingActId) {
            closeActEditor()
            selectAct(null)
        }
        selectPerformer(null)
        selectMarkdownEditor(null)
    }, [
        clearTransformTarget,
        closeEditor,
        editingActId,
        closeActEditor,
        selectPerformer,
        selectMarkdownEditor,
        selectAct,
    ])

    const onConnect = useCallback((connection: Connection) => {
        routeActConnection({
            currentActId: editingActId,
            connection,
            nodes,
            onConnectPerformersInAct: (actId, performerIds) => {
                // Check if at least one performer is already bound, unless Act has no participants
                const state = useStudioStore.getState()
                const act = state.acts.find((a) => a.id === actId)
                const participantCount = act ? Object.keys(act.participants).length : 0

                if (participantCount > 0) {
                    const isPerformerBound = (performerId: string) => {
                        const performer = state.performers.find((p: PerformerNode) => p.id === performerId)
                        const derivedFrom = performer?.meta?.derivedFrom?.trim()
                        return act && Object.values(act.participants).some((binding: WorkspaceActParticipantBinding) => {
                            const ref = binding.performerRef
                            return (ref.kind === 'draft' && ref.draftId === performerId)
                                || (ref.kind === 'registry' && !!derivedFrom && ref.urn === derivedFrom)
                        })
                    }
                    if (!isPerformerBound(performerIds[0]) && !isPerformerBound(performerIds[1])) {
                        // Both performers are unbound — block the connection
                        return
                    }
                }

                const sourceKey = attachPerformerToAct(actId, performerIds[0])
                const targetKey = attachPerformerToAct(actId, performerIds[1])
                if (!sourceKey || !targetKey || sourceKey === targetKey) {
                    return
                }
                addRelation(actId, [sourceKey, targetKey], 'one-way')
                openActEditor(actId, 'act')
            },
        })
    }, [
        editingActId,
        nodes,
        attachPerformerToAct,
        addRelation,
        openActEditor,
    ])

    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        const filtered = changes.filter((change) => change.type !== 'select')
        onNodesChange(filtered)

        changes.forEach((change) => {
            const resizeResult = resolveCanvasResizeChange(change, nodes)
            if (!resizeResult) return

            const ownsResize = (
                ('id' in resizeResult && !!transformTarget && transformTarget.id === resizeResult.id && transformTarget.type === resizeResult.kind)
                || (resizeResult.kind === 'stageTracking' && transformTarget?.type === 'stageTracking')
            )
            if (!ownsResize) return

            switch (resizeResult.kind) {
                case 'markdownEditor':
                    updateMarkdownEditorSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
                case 'canvasTerminal':
                    updateCanvasTerminalSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
                case 'stageTracking':
                    updateTrackingWindowSize(resizeResult.width, resizeResult.height)
                    return
                case 'act':
                    updateActSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
                case 'performer':
                    updatePerformerSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
            }
        })
    }, [
        onNodesChange,
        nodes,
        transformTarget,
        updateMarkdownEditorSize,
        updateCanvasTerminalSize,
        updateTrackingWindowSize,
        updateActSize,
        updatePerformerSize,
    ])

    const onMoveEnd = useCallback(() => {
        if (!reactFlowInstance || !canvasAreaRef.current) {
            return
        }

        const rect = canvasAreaRef.current.getBoundingClientRect()
        const center = reactFlowInstance.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        })
        setCanvasCenter(Math.round(center.x), Math.round(center.y))
    }, [reactFlowInstance, canvasAreaRef, setCanvasCenter])

    return {
        onEdgeClick,
        onNodeDragStop,
        onNodeClick,
        onPaneClick,
        onConnect,
        handleNodesChange,
        onMoveEnd,
    }
}
