import type { Node } from '@xyflow/react'

export function composeCanvasNodes(args: {
    performerNodes: Node[]
    markdownEditorNodes: Node[]
    canvasTerminalNodes: Node[]
    trackingNodes: Node[]
    actNodes: Node[]
}) {
    return [
        ...args.performerNodes,
        ...args.markdownEditorNodes,
        ...args.canvasTerminalNodes,
        ...args.trackingNodes,
        ...args.actNodes,
    ]
}
