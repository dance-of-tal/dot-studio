import { EyeOff, Maximize2, Minimize2, Pencil, X } from 'lucide-react'
import './ActHeaderActions.css'

type ActHeaderActionsProps = {
    focused: boolean
    editing: boolean
    onToggleFocus: () => void
    onToggleEdit: () => void
    onHide: () => void
}

export default function ActHeaderActions({
    focused,
    editing,
    onToggleFocus,
    onToggleEdit,
    onHide,
}: ActHeaderActionsProps) {
    return (
        <div className="act-frame__header-actions">
            <button
                className={`icon-btn act-frame__focus-btn ${focused ? 'active' : ''}`}
                title={focused ? 'Exit focus mode' : 'Focus mode'}
                onClick={(event) => {
                    event.stopPropagation()
                    onToggleFocus()
                }}
            >
                {focused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
            <button
                className={`icon-btn act-frame__edit-btn ${editing ? 'active' : ''}`}
                title={editing ? 'Exit edit mode' : 'Edit Act'}
                onClick={(event) => {
                    event.stopPropagation()
                    onToggleEdit()
                }}
            >
                {editing ? <X size={11} /> : <Pencil size={11} />}
            </button>
            <button
                className="icon-btn act-frame__close-btn"
                title="Hide Act"
                onClick={(event) => {
                    event.stopPropagation()
                    onHide()
                }}
            >
                <EyeOff size={11} />
            </button>
        </div>
    )
}
