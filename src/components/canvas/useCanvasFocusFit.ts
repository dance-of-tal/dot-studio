import { useEffect } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { CanvasRevealTarget } from '../../store/types'

export function useCanvasFocusFit(args: {
    focusedPerformerId: string | null
    canvasRevealTarget: CanvasRevealTarget | null
    reactFlowInstance: ReactFlowInstance<Node> | null
    nodeCount: number
}) {
    const { focusedPerformerId, canvasRevealTarget, reactFlowInstance, nodeCount } = args

    useEffect(() => {
        const focusNodeId = canvasRevealTarget?.id || focusedPerformerId || null

        if (!reactFlowInstance || !focusNodeId) {
            return
        }

        const timer = window.setTimeout(() => {
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
    }, [focusedPerformerId, canvasRevealTarget?.id, canvasRevealTarget?.nonce, reactFlowInstance, nodeCount])
}
