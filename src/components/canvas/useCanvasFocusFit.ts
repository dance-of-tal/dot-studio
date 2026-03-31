import { useEffect } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import { resolveFocusNodeId } from '../../lib/focus-utils'
import type { CanvasRevealTarget, FocusSnapshot } from '../../store/types'

export function useCanvasFocusFit(args: {
    focusedPerformerId: string | null
    focusSnapshot: FocusSnapshot | null
    canvasRevealTarget: CanvasRevealTarget | null
    reactFlowInstance: ReactFlowInstance<Node> | null
    nodeCount: number
}) {
    const { focusedPerformerId, focusSnapshot, canvasRevealTarget, reactFlowInstance, nodeCount } = args

    useEffect(() => {
        const focusNodeId = canvasRevealTarget?.id || resolveFocusNodeId(focusSnapshot, focusedPerformerId)

        if (!reactFlowInstance || !focusNodeId) {
            return
        }

        const isFocusMode = !!focusSnapshot && focusNodeId === resolveFocusNodeId(focusSnapshot, focusedPerformerId)
        const timer = window.setTimeout(() => {
            if (isFocusMode) {
                reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 })
                return
            }

            reactFlowInstance.fitView({
                duration: 250,
                padding: 0.15,
                minZoom: 1,
                maxZoom: 1,
                nodes: [{ id: focusNodeId }],
            })
        }, 80)

        return () => {
            window.clearTimeout(timer)
        }
    }, [focusedPerformerId, focusSnapshot, canvasRevealTarget?.id, canvasRevealTarget?.nonce, reactFlowInstance, nodeCount])
}
