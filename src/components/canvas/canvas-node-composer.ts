import type { Node } from '@xyflow/react'

export function composeCanvasNodes(args: {
    performerNodes: Node[]
    markdownEditorNodes: Node[]
    canvasTerminalNodes: Node[]
    actNodes: Node[]
}) {
    return [
        ...args.performerNodes,
        ...args.markdownEditorNodes,
        ...args.canvasTerminalNodes,
        ...args.actNodes,
    ]
}
