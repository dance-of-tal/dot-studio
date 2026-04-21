import type { Edge, Node } from '@xyflow/react'
import type { WorkspaceSlice } from '../../store/types'

type EditingTargetLike = WorkspaceSlice['editingTarget'] | undefined

export type CanvasDragStopResult =
    | { kind: 'markdownEditor'; id: string; x: number; y: number }
    | { kind: 'canvasTerminal'; id: string; x: number; y: number }
    | { kind: 'act'; id: string; x: number; y: number }
    | { kind: 'performer'; id: string; x: number; y: number }

export type CanvasNodeClickResult =
    | { kind: 'ignore' }
    | { kind: 'markdownEditor'; id: string }
    | { kind: 'canvasTerminal' }
    | { kind: 'act'; id: string }
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

export function resolveCanvasDragStop(node: Pick<Node, 'id' | 'position' | 'type'>): CanvasDragStopResult {
    const position = roundedPosition(node)

    if (node.type === 'markdownEditor') {
        return { kind: 'markdownEditor', id: node.id, ...position }
    }

    if (node.type === 'canvasTerminal') {
        return { kind: 'canvasTerminal', id: node.id, ...position }
    }

    if (node.type === 'act') {
        return { kind: 'act', id: node.id, ...position }
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

    if (node.type === 'act') {
        return { kind: 'act', id: node.id }
    }

    return {
        kind: 'performer',
        id: node.id,
        shouldCloseEditor: !!(editingTarget && !(editingTarget.type === 'performer' && editingTarget.id === node.id)),
    }
}

export function resolveCanvasEdgeClick(edge: Pick<Edge, 'id'>) {
    // Edges on main canvas represent Act relations — edge.id format: rel:{actId}:{relationId}
    if (edge.id.startsWith('rel:')) {
        const parts = edge.id.split(':')
        return parts.length >= 3 ? parts.slice(2).join(':') : edge.id
    }

    // Backward-compatible fallback for older edge ids:
    // rel-{actId}-{relationId}. Relation ids themselves start with "rel-".
    const relationMarker = edge.id.indexOf('-rel-')
    if (relationMarker >= 0) {
        return edge.id.slice(relationMarker + 1)
    }

    return edge.id
}
