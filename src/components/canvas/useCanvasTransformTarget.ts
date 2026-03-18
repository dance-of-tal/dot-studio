import { useCallback, useEffect, useState } from 'react'
import type {
    CanvasTerminalNode,
    CanvasTrackingWindow,
    MarkdownEditorNode,
    PerformerNode,
} from '../../types'

type CanvasNodeKind = 'performer' | 'markdownEditor' | 'canvasTerminal' | 'stageTracking' | 'act' | 'act-participant'

export function useCanvasTransformTarget(args: {
    performers: PerformerNode[]
    markdownEditors: MarkdownEditorNode[]
    canvasTerminals: CanvasTerminalNode[]
    trackingWindow: CanvasTrackingWindow | null | undefined
}) {
    const { performers, markdownEditors, canvasTerminals, trackingWindow } = args
    const [transformTarget, setTransformTarget] = useState<{ id: string; type: CanvasNodeKind } | null>(null)

    const clearTransformTarget = useCallback(() => {
        setTransformTarget(null)
    }, [])

    const activateTransformTarget = useCallback((type: CanvasNodeKind, id: string) => {
        setTransformTarget({ type, id })
    }, [])

    const deactivateTransformTarget = useCallback((type: CanvasNodeKind, id: string) => {
        setTransformTarget((current) => (
            current && current.type === type && current.id === id
                ? null
                : current
        ))
    }, [])

    useEffect(() => {
        if (!transformTarget) {
            return
        }

        const exists = (
            (transformTarget.type === 'performer' && performers.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'markdownEditor' && markdownEditors.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'canvasTerminal' && canvasTerminals.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'stageTracking' && trackingWindow?.id === transformTarget.id)
        )

        if (!exists) {
            setTransformTarget(null)
        }
    }, [performers, markdownEditors, canvasTerminals, trackingWindow, transformTarget])

    return {
        transformTarget,
        clearTransformTarget,
        activateTransformTarget,
        deactivateTransformTarget,
    }
}
