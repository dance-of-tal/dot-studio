import { useEffect } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'

export function useCanvasFocusFit(args: {
    focusedPerformerId: string | null
    reactFlowInstance: ReactFlowInstance<Node> | null
    nodeCount: number
}) {
    const { focusedPerformerId, reactFlowInstance, nodeCount } = args

    useEffect(() => {
        const focusNodeId = focusedPerformerId || null

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
    }, [focusedPerformerId, reactFlowInstance, nodeCount])
}
