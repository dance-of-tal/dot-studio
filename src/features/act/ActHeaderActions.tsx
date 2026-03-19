import { Activity, EyeOff, Plus, Workflow } from 'lucide-react'
import './ActHeaderActions.css'

type ActHeaderActionsProps = {
    showActivity: boolean
    onToggleActivity: () => void
    onAddParticipant: () => void
    onCreateThread: () => void
    onHide: () => void
}

export default function ActHeaderActions({
    showActivity,
    onToggleActivity,
    onAddParticipant,
    onCreateThread,
    onHide,
}: ActHeaderActionsProps) {
    return (
        <div className="act-frame__header-actions">
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
