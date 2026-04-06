import { useEffect } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import {
    buildFocusFitViewOptions,
    resolveFocusNodeId,
    revealCanvasNodeWithoutZoom,
} from '../../lib/focus-utils'
import type { CanvasRevealTarget, FocusSnapshot } from '../../store/types'

export function useCanvasFocusFit(args: {
    focusSnapshot: FocusSnapshot | null
    canvasRevealTarget: CanvasRevealTarget | null
    reactFlowInstance: ReactFlowInstance<Node> | null
    nodeCount: number
}) {
    const { focusSnapshot, canvasRevealTarget, reactFlowInstance, nodeCount } = args

    useEffect(() => {
        const focusNodeId = canvasRevealTarget?.id || resolveFocusNodeId(focusSnapshot)

        if (!reactFlowInstance || !focusNodeId) {
            return
        }

        const isFocusMode = !!focusSnapshot && focusNodeId === resolveFocusNodeId(focusSnapshot)
        const timer = window.setTimeout(() => {
            if (isFocusMode) {
                reactFlowInstance.fitView(buildFocusFitViewOptions(focusNodeId))
                return
            }

            revealCanvasNodeWithoutZoom(reactFlowInstance, focusNodeId)
        }, 80)

        return () => {
            window.clearTimeout(timer)
        }
    }, [focusSnapshot, canvasRevealTarget?.id, canvasRevealTarget?.nonce, reactFlowInstance, nodeCount])
}
