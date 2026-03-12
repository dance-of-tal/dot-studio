import type { PointerEventHandler, ReactNode, RefObject } from 'react'
import CanvasDragHandle from './CanvasDragHandle'
import './CanvasWindowFrame.css'

type CanvasWindowFrameProps = {
    className?: string
    width: number | string
    height: number | string
    onPointerDownCapture?: PointerEventHandler<HTMLDivElement>
    chrome?: ReactNode
    dragHandleActive?: boolean
    onActivateTransform?: () => void
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
    onPointerDownCapture,
    chrome,
    dragHandleActive = false,
    onActivateTransform,
    headerStart,
    headerEnd,
    bodyClassName = '',
    bodyRef,
    children,
}: CanvasWindowFrameProps) {
    return (
        <div
            className={`figma-frame ${className}`.trim()}
            style={{ width, height }}
            onPointerDownCapture={onPointerDownCapture}
        >
            {chrome}
            <div className="figma-frame__header">
                <CanvasDragHandle active={dragHandleActive} onActivate={onActivateTransform} />
                <div className="figma-frame__header-start">
                    {headerStart}
                </div>
                {headerEnd ? (
                    <div className="figma-frame__header-end">
                        {headerEnd}
                    </div>
                ) : null}
            </div>
            <div ref={bodyRef} className={`figma-frame__body ${bodyClassName}`.trim()}>
                {children}
            </div>
        </div>
    )
}
