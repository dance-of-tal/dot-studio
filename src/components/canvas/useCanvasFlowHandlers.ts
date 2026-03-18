import { useCallback } from 'react'
import type { Connection, Node, NodeChange, ReactFlowInstance } from '@xyflow/react'
import { routeActConnection } from './act-connect-router'
import {
    resolveCanvasDragStop,
    resolveCanvasEdgeClick,
    resolveCanvasNodeClick,
    shouldResetCanvasPaneSelection,
} from './canvas-event-router'
import { resolveCanvasResizeChange } from './canvas-resize-router'

type EditingTargetLike = { type: string; id: string } | null

type UseCanvasFlowHandlersArgs = {
    isActLayoutMode: boolean
    layoutActId: string | null
    nodes: Node[]
    editingTarget: EditingTargetLike
    reactFlowInstance: ReactFlowInstance<Node> | null
    canvasAreaRef: React.RefObject<HTMLDivElement | null>
    clearTransformTarget: () => void
    closeEditor: () => void
    setCanvasCenter: (x: number, y: number) => void
    selectMarkdownEditor: (id: string | null) => void
    selectPerformer: (id: string | null) => void
    setActiveChatPerformer: (id: string | null) => void
    selectAct: (id: string | null) => void
    selectActParticipant: (participantKey: string | null) => void
    selectRelation: (relationId: string | null) => void
    addRelation: (actId: string, between: [string, string], direction?: 'one-way' | 'both') => string | null
    createActFromPerformers: (performerIds: [string, string], options?: { actName?: string }) => string | null
    attachPerformerToAct: (actId: string, performerId: string) => string | null
    onNodesChange: (changes: NodeChange<Node>[]) => void
    updateMarkdownEditorPosition: (id: string, x: number, y: number) => void
    updateCanvasTerminalPosition: (id: string, x: number, y: number) => void
    updateTrackingWindowPosition: (x: number, y: number) => void
    updateActPosition: (id: string, x: number, y: number) => void
    updateActParticipantPosition: (actId: string, participantKey: string, x: number, y: number) => void
    updatePerformerPosition: (id: string, x: number, y: number) => void
    updateMarkdownEditorSize: (id: string, width: number, height: number) => void
    updateCanvasTerminalSize: (id: string, width: number, height: number) => void
    updateTrackingWindowSize: (width: number, height: number) => void
    updatePerformerSize: (id: string, width: number, height: number) => void
    resolveActLayoutRelation: (connection: Pick<Connection, 'source' | 'target'>) => [string, string] | null
    shouldHandleActLayoutConnection: (isActLayoutMode: boolean, layoutActId: string | null, connection: Pick<Connection, 'source' | 'target'>) => boolean
}

export function useCanvasFlowHandlers(args: UseCanvasFlowHandlersArgs) {
    const {
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
    } = args

    const onEdgeClick = useCallback((_event: React.MouseEvent, edge: import('@xyflow/react').Edge) => {
        const relationId = resolveCanvasEdgeClick(isActLayoutMode, edge)
        if (!relationId) return
        selectRelation(relationId)
    }, [isActLayoutMode, selectRelation])

    const onNodeDragStop = useCallback((_: unknown, node: Node) => {
        const result = resolveCanvasDragStop(node, layoutActId)

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
            case 'act-participant':
                updateActParticipantPosition(result.actId, result.participantKey, result.x, result.y)
                return
            case 'performer':
                updatePerformerPosition(result.id, result.x, result.y)
                return
        }
    }, [
        layoutActId,
        updateMarkdownEditorPosition,
        updateCanvasTerminalPosition,
        updateTrackingWindowPosition,
        updateActPosition,
        updateActParticipantPosition,
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
                selectMarkdownEditor(result.id)
                return
            case 'canvasTerminal':
            case 'stageTracking':
                closeEditor()
                selectPerformer(null)
                selectMarkdownEditor(null)
                return
            case 'act':
                closeEditor()
                selectPerformer(null)
                selectMarkdownEditor(null)
                selectAct(result.id)
                return
            case 'act-participant':
                selectActParticipant(result.participantKey)
                return
            case 'performer':
                if (result.shouldCloseEditor) {
                    closeEditor()
                }
                selectPerformer(result.id)
                setActiveChatPerformer(result.id)
                return
            case 'ignore':
                return
        }
    }, [
        editingTarget,
        clearTransformTarget,
        closeEditor,
        selectMarkdownEditor,
        selectPerformer,
        selectAct,
        selectActParticipant,
        setActiveChatPerformer,
    ])

    const onPaneClick = useCallback(() => {
        clearTransformTarget()
        closeEditor()
        selectPerformer(null)
        selectMarkdownEditor(null)
        selectAct(null)
        if (shouldResetCanvasPaneSelection(isActLayoutMode)) {
            selectActParticipant(null)
            selectRelation(null)
        }
    }, [
        clearTransformTarget,
        closeEditor,
        selectPerformer,
        selectMarkdownEditor,
        selectAct,
        isActLayoutMode,
        selectActParticipant,
        selectRelation,
    ])

    const onConnect = useCallback((connection: Connection) => {
        routeActConnection({
            isActLayoutMode,
            layoutActId,
            connection,
            nodes,
            onAddLayoutRelation: (between) => {
                if (!layoutActId) return
                addRelation(layoutActId, between, 'both')
            },
            onCreateActFromPerformers: createActFromPerformers,
            onAttachPerformerToAct: attachPerformerToAct,
            resolveActLayoutRelation,
            shouldHandleActLayoutConnection,
        })
    }, [
        isActLayoutMode,
        layoutActId,
        nodes,
        addRelation,
        createActFromPerformers,
        attachPerformerToAct,
        resolveActLayoutRelation,
        shouldHandleActLayoutConnection,
    ])

    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        const filtered = changes.filter((change) => change.type !== 'select')
        onNodesChange(filtered)

        changes.forEach((change) => {
            const resizeResult = resolveCanvasResizeChange(change, nodes)
            if (!resizeResult) return

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
                case 'performer':
                    updatePerformerSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
            }
        })
    }, [
        onNodesChange,
        nodes,
        updateMarkdownEditorSize,
        updateCanvasTerminalSize,
        updateTrackingWindowSize,
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
