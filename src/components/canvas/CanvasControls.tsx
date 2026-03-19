import { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { Viewport } from '@xyflow/react'
import { Maximize, Maximize2, Minimize, Minimize2 } from 'lucide-react'
import { useStudioStore } from '../../store'

export default function CanvasControls() {
    const { fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow()
    const [isFitted, setIsFitted] = useState(false)
    const prevViewport = useRef<Viewport | null>(null)

    const {
        selectedPerformerId,
        selectedActId,
        focusSnapshot,
        enterFocusMode,
        exitFocusMode,
        exitActLayoutMode,
    } = useStudioStore()
    const isFocusActive = !!focusSnapshot

    const toggleFitView = useCallback(() => {
        if (isFitted && prevViewport.current) {
            setViewport(prevViewport.current, { duration: 400 })
            setIsFitted(false)
        } else {
            prevViewport.current = getViewport()
            fitView({ duration: 400, padding: 0.1, maxZoom: 1 })
            setIsFitted(true)
        }
    }, [isFitted, fitView, getViewport, setViewport])

    const toggleFocus = useCallback(() => {
        if (isFocusActive) {
            exitFocusMode()
            setTimeout(() => {
                fitView({ duration: 400, padding: 0.2, maxZoom: 1 })
            }, 50)
            return
        }

        const nodeId = selectedPerformerId || selectedActId
        const nodeType = selectedPerformerId ? 'performer' as const : 'act' as const
        if (!nodeId) return

        const canvasEl = document.querySelector('.canvas-area')
        const rect = canvasEl?.getBoundingClientRect()
        enterFocusMode(nodeId, nodeType, {
            width: rect?.width ?? 1200,
            height: rect?.height ?? 800,
        })
    }, [isFocusActive, selectedPerformerId, selectedActId, enterFocusMode, exitFocusMode, fitView])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return

            if (focusSnapshot?.type === 'act') {
                exitActLayoutMode()
                exitFocusMode()
                setTimeout(() => {
                    fitView({ duration: 400, padding: 0.2, maxZoom: 1 })
                }, 50)
                return
            }

            if (isFocusActive) {
                exitFocusMode()
                setTimeout(() => {
                    fitView({ duration: 400, padding: 0.2, maxZoom: 1 })
                }, 50)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFocusActive, exitFocusMode, focusSnapshot, exitActLayoutMode, fitView])

    return (
        <div className="canvas-controls">
            {!isFocusActive && (
                <>
                    <button className="canvas-controls__btn" onClick={() => zoomIn({ duration: 200 })} title="Zoom In">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    <button className="canvas-controls__btn" onClick={() => zoomOut({ duration: 200 })} title="Zoom Out">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                </>
            )}
            {(selectedPerformerId || selectedActId) && (
                <button className="canvas-controls__btn" onClick={toggleFocus} title={isFocusActive ? 'Exit Focus Mode' : 'Focus Selected'}>
                    {isFocusActive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            )}
            {!isFocusActive && (
                <button className="canvas-controls__btn" onClick={toggleFitView} title={isFitted ? 'Restore View' : 'Fit to Screen'}>
                    {isFitted ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
            )}
        </div>
    )
}
