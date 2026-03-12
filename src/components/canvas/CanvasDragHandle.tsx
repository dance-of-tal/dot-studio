import { Move } from 'lucide-react'
import './CanvasDragHandle.css'

type CanvasDragHandleProps = {
    active?: boolean
    interactive?: boolean
    onActivate?: () => void
    stopPropagation?: boolean
    title?: string
}

export default function CanvasDragHandle({
    active = false,
    interactive = true,
    onActivate,
    stopPropagation = false,
    title = 'Move and resize window',
}: CanvasDragHandleProps) {
    const className = `canvas-drag-handle${interactive ? ' canvas-drag-handle--interactive' : ''}${active ? ' canvas-drag-handle--active' : ''}`

    if (!interactive) {
        return (
            <span className={className} aria-hidden="true">
                <Move size={12} strokeWidth={1.8} />
            </span>
        )
    }

    return (
        <button
            type="button"
            className={className}
            onPointerDown={(event) => {
                if (stopPropagation) {
                    event.preventDefault()
                    event.stopPropagation()
                    return
                }
                onActivate?.()
            }}
            onClick={(event) => {
                if (stopPropagation) {
                    event.preventDefault()
                    event.stopPropagation()
                }
                onActivate?.()
            }}
            title={title}
            aria-label={title}
        >
            <Move size={12} strokeWidth={1.8} />
        </button>
    )
}
