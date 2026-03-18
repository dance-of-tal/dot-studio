import type { Node } from '@xyflow/react'

export function composeCanvasNodes(args: {
    isActLayoutMode: boolean
    actLayoutNodes: Node[]
    performerNodes: Node[]
    markdownEditorNodes: Node[]
    canvasTerminalNodes: Node[]
    trackingNodes: Node[]
    actNodes: Node[]
}) {
    if (args.isActLayoutMode) {
        return args.actLayoutNodes
    }

    return [
        ...args.performerNodes,
        ...args.markdownEditorNodes,
        ...args.canvasTerminalNodes,
        ...args.trackingNodes,
        ...args.actNodes,
    ]
}
