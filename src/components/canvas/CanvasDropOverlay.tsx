type CanvasDropOverlayProps = {
    active: boolean
    label: string | null
}

export default function CanvasDropOverlay({ active, label }: CanvasDropOverlayProps) {
    if (!label) {
        return null
    }

    return (
        <div className={`canvas-drop-overlay ${active ? 'is-active' : ''}`}>
            <div className="canvas-drop-overlay__card">
                <div className="canvas-drop-overlay__title">Canvas drop target</div>
                <div className="canvas-drop-overlay__body">{label}</div>
            </div>
        </div>
    )
}
