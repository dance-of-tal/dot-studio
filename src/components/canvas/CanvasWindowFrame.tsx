import { useRef, useEffect, type ReactNode, type RefObject } from 'react'
import { NodeResizer } from '@xyflow/react'
import CanvasDragHandle from './CanvasDragHandle'
import useTransformChrome from './useTransformChrome'
import './CanvasWindowFrame.css'

type CanvasWindowFrameProps = {
    className?: string
    width: number | string
    height: number | string
    /** If true (default), the frame is resizable via NodeResizer handles. */
    resizable?: boolean
    minWidth?: number
    minHeight?: number
    /** True when the parent canvas has entered transform mode for this node. */
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
    /** Callback fired when user starts resizing. */
    onResizeStart?: () => void
    /** Callback fired when user finishes resizing. */
    onResizeEnd?: () => void
    selected?: boolean
    headerStart: ReactNode
    headerEnd?: ReactNode
    bodyClassName?: string
    bodyRef?: RefObject<HTMLDivElement | null>
    children: ReactNode
}

export default function CanvasWindowFrame({
    className = '',
    width,
    height,
    resizable = true,
    minWidth = 280,
    minHeight = 220,
    transformActive = false,
    onActivateTransform,
    onDeactivateTransform,
    onResizeStart,
    onResizeEnd,
    selected = false,
    headerStart,
    headerEnd,
    bodyClassName = '',
    bodyRef,
    children,
}: CanvasWindowFrameProps) {
    const frameRef = useRef<HTMLDivElement>(null)

    const {
        isTransformChromeActive,
        showResizeChrome,
        toggleTransformChrome,
        handleFramePointerDownCapture,
        handleResizeStart,
        handleResizeEnd,
    } = useTransformChrome({
        active: transformActive,
        onActivate: onActivateTransform,
        onDeactivate: onDeactivateTransform,
    })

    // Block Ctrl+wheel (trackpad pinch) inside the frame to prevent browser zoom
    useEffect(() => {
        const el = frameRef.current
        if (!el) return
        const handler = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
            }
        }
        el.addEventListener('wheel', handler, { passive: false })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    const hasFrameChrome = selected || showResizeChrome

    const handleResizeEndCombined = () => {
        handleResizeEnd()
        onResizeEnd?.()
    }

    const handleResizeStartCombined = () => {
        handleResizeStart()
        onResizeStart?.()
    }

    return (
        <div
            ref={frameRef}
            className={`canvas-frame ${hasFrameChrome ? 'canvas-frame--active' : ''} ${hasFrameChrome && !showResizeChrome ? 'canvas-frame--content-active' : ''} ${className}`.trim()}
            style={{ width, height, touchAction: 'none' }}
            onPointerDownCapture={handleFramePointerDownCapture}
        >
            {resizable && (
                <NodeResizer
                    color="var(--text-muted)"
                    lineStyle={{ borderWidth: 0 }}
                    isVisible={showResizeChrome}
                    minWidth={minWidth}
                    minHeight={minHeight}
                    handleStyle={{
                        width: 8,
                        height: 8,
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-strong)',
                    }}
                    onResizeStart={handleResizeStartCombined}
                    onResizeEnd={handleResizeEndCombined}
                />
            )}
            <div className="canvas-frame__header">
                <CanvasDragHandle active={isTransformChromeActive} onToggle={toggleTransformChrome} />
                <div className="canvas-frame__header-start">
                    {headerStart}
                </div>
                {headerEnd ? (
                    <div className="canvas-frame__header-end">
                        {headerEnd}
                    </div>
                ) : null}
            </div>
            <div ref={bodyRef} className={`canvas-frame__body ${bodyClassName}`.trim()}>
                {children}
            </div>
        </div>
    )
}
