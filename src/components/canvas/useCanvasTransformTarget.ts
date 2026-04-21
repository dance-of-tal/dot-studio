import { useCallback, useEffect, useState } from 'react'
import type {
    CanvasTerminalNode,
    MarkdownEditorNode,
    PerformerNode,
    WorkspaceAct,
} from '../../types'

type CanvasNodeKind = 'performer' | 'markdownEditor' | 'canvasTerminal' | 'act'

export function useCanvasTransformTarget(args: {
    acts: WorkspaceAct[]
    performers: PerformerNode[]
    markdownEditors: MarkdownEditorNode[]
    canvasTerminals: CanvasTerminalNode[]
}) {
    const { acts, performers, markdownEditors, canvasTerminals } = args
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
            (transformTarget.type === 'act' && acts.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'performer' && performers.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'markdownEditor' && markdownEditors.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'canvasTerminal' && canvasTerminals.some((item) => item.id === transformTarget.id))
        )

        if (!exists) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setTransformTarget(null)
        }
    }, [acts, performers, markdownEditors, canvasTerminals, transformTarget])

    return {
        transformTarget,
        clearTransformTarget,
        activateTransformTarget,
        deactivateTransformTarget,
    }
}
