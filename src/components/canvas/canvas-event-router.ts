import type { Edge, Node } from '@xyflow/react'
import {
    actLayoutDragPosition,
    actLayoutEdgeSelection,
    actLayoutSelection,
    shouldResetActLayoutSelection,
} from './act-layout-helpers'

type EditingTargetLike = { type: string; id: string } | null | undefined

export type CanvasDragStopResult =
    | { kind: 'markdownEditor'; id: string; x: number; y: number }
    | { kind: 'canvasTerminal'; id: string; x: number; y: number }
    | { kind: 'stageTracking'; x: number; y: number }
    | { kind: 'act'; id: string; x: number; y: number }
    | { kind: 'act-participant'; actId: string; participantKey: string; x: number; y: number }
    | { kind: 'performer'; id: string; x: number; y: number }

export type CanvasNodeClickResult =
    | { kind: 'ignore' }
    | { kind: 'markdownEditor'; id: string }
    | { kind: 'canvasTerminal' }
    | { kind: 'stageTracking' }
    | { kind: 'act'; id: string }
    | { kind: 'act-participant'; participantKey: string }
    | { kind: 'performer'; id: string; shouldCloseEditor: boolean }

function roundedPosition(node: Pick<Node, 'position'>) {
    return {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
    }
}

export function shouldIgnoreCanvasInteractiveClick(target: EventTarget | null) {
    return target instanceof HTMLElement && !!target.closest('.canvas-drag-handle--interactive')
}

export function resolveCanvasDragStop(node: Pick<Node, 'id' | 'position' | 'type'>, layoutActId: string | null): CanvasDragStopResult {
    const position = roundedPosition(node)

    if (node.type === 'markdownEditor') {
        return { kind: 'markdownEditor', id: node.id, ...position }
    }

    if (node.type === 'canvasTerminal') {
        return { kind: 'canvasTerminal', id: node.id, ...position }
    }

    if (node.type === 'stageTracking') {
        return { kind: 'stageTracking', ...position }
    }

    if (node.type === 'act') {
        return { kind: 'act', id: node.id, ...position }
    }

    const actLayoutMove = actLayoutDragPosition(node, layoutActId)
    if (actLayoutMove) {
        return {
            kind: 'act-participant',
            actId: actLayoutMove.actId,
            participantKey: actLayoutMove.participantKey,
            x: actLayoutMove.x,
            y: actLayoutMove.y,
        }
    }

    return { kind: 'performer', id: node.id, ...position }
}

export function resolveCanvasNodeClick(
    node: Pick<Node, 'id' | 'type'>,
    target: EventTarget | null,
    editingTarget: EditingTargetLike,
): CanvasNodeClickResult {
    if (shouldIgnoreCanvasInteractiveClick(target)) {
        return { kind: 'ignore' }
    }

    if (node.type === 'markdownEditor') {
        return { kind: 'markdownEditor', id: node.id }
    }

    if (node.type === 'canvasTerminal') {
        return { kind: 'canvasTerminal' }
    }

    if (node.type === 'stageTracking') {
        return { kind: 'stageTracking' }
    }

    if (node.type === 'act') {
        return { kind: 'act', id: node.id }
    }

    const actLayoutParticipant = actLayoutSelection(node)
    if (actLayoutParticipant) {
        return { kind: 'act-participant', participantKey: actLayoutParticipant }
    }

    return {
        kind: 'performer',
        id: node.id,
        shouldCloseEditor: !!(editingTarget && !(editingTarget.type === 'performer' && editingTarget.id === node.id)),
    }
}

export function resolveCanvasEdgeClick(isActLayoutMode: boolean, edge: Pick<Edge, 'id'>) {
    if (!isActLayoutMode) return null
    return actLayoutEdgeSelection(edge)
}

export function shouldResetCanvasPaneSelection(isActLayoutMode: boolean) {
    return shouldResetActLayoutSelection(isActLayoutMode)
}
