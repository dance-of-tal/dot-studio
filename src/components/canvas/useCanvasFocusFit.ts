import { useEffect, useRef } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import {
    FOCUS_EXIT_FIT,
    FOCUS_VIEWPORT_SYNC_DELAY,
    resolveFocusNodeId,
    revealCanvasNodeWithoutZoom,
    syncFocusViewport,
} from '../../lib/focus-utils'
import type { CanvasRevealTarget, FocusSnapshot } from '../../store/types'

export function useCanvasFocusFit(args: {
    focusSnapshot: FocusSnapshot | null
    canvasRevealTarget: CanvasRevealTarget | null
    reactFlowInstance: ReactFlowInstance<Node> | null
    nodeCount: number
}) {
    const { focusSnapshot, canvasRevealTarget, reactFlowInstance, nodeCount } = args
    const wasFocusActiveRef = useRef(false)

    useEffect(() => {
        if (!reactFlowInstance) {
            wasFocusActiveRef.current = !!focusSnapshot
            return
        }

        const isFocusActive = !!focusSnapshot
        const focusNodeId = resolveFocusNodeId(focusSnapshot)
        const wasFocusActive = wasFocusActiveRef.current

        const timer = window.setTimeout(() => {
            if (isFocusActive && focusNodeId) {
                syncFocusViewport(reactFlowInstance)
                return
            }

            if (wasFocusActive) {
                reactFlowInstance.fitView(FOCUS_EXIT_FIT)
                return
            }

            if (canvasRevealTarget?.id) {
                revealCanvasNodeWithoutZoom(reactFlowInstance, canvasRevealTarget.id)
            }
        }, FOCUS_VIEWPORT_SYNC_DELAY)

        wasFocusActiveRef.current = isFocusActive

        return () => {
            window.clearTimeout(timer)
        }
    }, [focusSnapshot, canvasRevealTarget?.id, canvasRevealTarget?.nonce, reactFlowInstance, nodeCount])
}
