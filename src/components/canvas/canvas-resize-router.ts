import type { Node, NodeChange } from '@xyflow/react'

export type CanvasResizeResult =
    | { kind: 'markdownEditor'; id: string; width: number; height: number }
    | { kind: 'canvasTerminal'; id: string; width: number; height: number }
    | { kind: 'act'; id: string; width: number; height: number }
    | { kind: 'performer'; id: string; width: number; height: number }

export function resolveCanvasResizeChange(
    change: NodeChange<Node>,
    nodes: Node[],
): CanvasResizeResult | null {
    if (change.type !== 'dimensions' || change.resizing !== false || !change.dimensions) {
        return null
    }

    const changedNode = nodes.find((node) => node.id === change.id)
    const { width, height } = change.dimensions

    if (changedNode?.type === 'markdownEditor') {
        return { kind: 'markdownEditor', id: change.id, width, height }
    }

    if (changedNode?.type === 'canvasTerminal') {
        return { kind: 'canvasTerminal', id: change.id, width, height }
    }

    if (changedNode?.type === 'act') {
        return { kind: 'act', id: change.id, width, height }
    }

    return { kind: 'performer', id: change.id, width, height }
}
