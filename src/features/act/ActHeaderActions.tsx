import { Activity, EyeOff, Maximize2, Minimize2, Pencil, Plus, Workflow } from 'lucide-react'
import './ActHeaderActions.css'

type ActHeaderActionsProps = {
    focused: boolean
    editing: boolean
    showActivity: boolean
    onToggleFocus: () => void
    onToggleActivity: () => void
    onEdit: () => void
    onAddParticipant: () => void
    onCreateThread: () => void
    onHide: () => void
}

export default function ActHeaderActions({
    focused,
    editing,
    showActivity,
    onToggleFocus,
    onToggleActivity,
    onEdit,
    onAddParticipant,
    onCreateThread,
    onHide,
}: ActHeaderActionsProps) {
    return (
        <div className="act-frame__header-actions">
            <button
                className={`icon-btn act-frame__focus-btn ${focused ? 'active' : ''}`}
                title={focused ? 'Exit focus mode' : 'Focus mode'}
                onClick={onToggleFocus}
            >
                {focused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
            <button
                className={`icon-btn act-frame__edit-btn ${editing ? 'active' : ''}`}
                title="Edit Act"
                onClick={onEdit}
            >
                <Pencil size={11} />
            </button>
            <button
                className="icon-btn act-frame__edit-btn"
                title="Add Participant"
                onClick={onAddParticipant}
            >
                <Plus size={11} />
            </button>
            <button
                className={`icon-btn act-frame__activity-btn ${showActivity ? 'active' : ''}`}
                title="Activity"
                onClick={onToggleActivity}
            >
                <Activity size={11} />
            </button>
            <button
                className="icon-btn act-frame__edit-btn"
                title="New Thread"
                onClick={onCreateThread}
            >
                <Workflow size={11} />
            </button>
            <button
                className="icon-btn act-frame__close-btn"
                title="Hide Act"
                onClick={onHide}
            >
                <EyeOff size={11} />
            </button>
        </div>
    )
}
