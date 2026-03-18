import { Scan } from 'lucide-react'
import './CanvasDragHandle.css'

type CanvasDragHandleProps = {
    active?: boolean
    interactive?: boolean
    onToggle?: () => void
    stopPropagation?: boolean
    title?: string
}

export default function CanvasDragHandle({
    active = false,
    interactive = true,
    onToggle,
    stopPropagation = false,
    title = 'Toggle resize handles',
}: CanvasDragHandleProps) {
    const className = `canvas-drag-handle${interactive ? ' canvas-drag-handle--interactive' : ''}${active ? ' canvas-drag-handle--active' : ''}`

    if (!interactive) {
        return (
            <span className={className} aria-hidden="true">
                <Scan size={11} strokeWidth={1.8} />
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
                onToggle?.()
            }}
            onClick={(event) => {
                if (stopPropagation) {
                    event.preventDefault()
                    event.stopPropagation()
                }
            }}
            title={title}
            aria-label={title}
        >
            <Scan size={11} strokeWidth={1.8} />
        </button>
    )
}
