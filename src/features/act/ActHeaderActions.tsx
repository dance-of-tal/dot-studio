import { EyeOff, Maximize2, Minimize2, Pencil, X } from 'lucide-react'
import type { ActReadinessResult } from './act-readiness'
import './ActHeaderActions.css'

type ActHeaderActionsProps = {
    focused: boolean
    editing: boolean
    readiness?: ActReadinessResult
    onToggleFocus: () => void
    onToggleEdit: () => void
    onHide: () => void
}

function readinessBadgeClass(readiness?: ActReadinessResult): string {
    if (!readiness) return ''
    if (!readiness.runnable) return 'act-frame__readiness-dot--error'
    if (readiness.issues.length > 0) return 'act-frame__readiness-dot--warning'
    return 'act-frame__readiness-dot--ok'
}

function readinessTitle(readiness?: ActReadinessResult): string {
    if (!readiness) return ''
    if (!readiness.runnable) {
        const first = readiness.issues.find((i) => i.severity === 'error')
        return first ? first.message : 'Act is not runnable'
    }
    if (readiness.issues.length > 0) return 'Runnable with warnings'
    return 'Ready to run'
}

export default function ActHeaderActions({
    focused,
    editing,
    readiness,
    onToggleFocus,
    onToggleEdit,
    onHide,
}: ActHeaderActionsProps) {
    return (
        <div className="act-frame__header-actions">
            {!focused && readiness && (
                <span
                    className={`act-frame__readiness-dot ${readinessBadgeClass(readiness)}`}
                    title={readinessTitle(readiness)}
                />
            )}
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
            {!focused && (
                <>
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
                </>
            )}
        </div>
    )
}
