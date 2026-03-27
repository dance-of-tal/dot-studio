/**
 * ActInspectorPanel — Right-side panel for the selected Act surface.
 *
 * It switches between:
 * - act meta/config
 * - participant binding
 * - relation detail
 */
import { Settings, User, ArrowRightLeft, X } from 'lucide-react'
import { useStudioStore } from '../../store'
import ActMetaView from './ActMetaView'
import ActRelationView from './ActRelationView'
import './ActInspectorPanel.css'
import './ActInspectorDetails.css'

export default function ActInspectorPanel() {
    const { acts, actEditorState, closeActEditor } = useStudioStore()

    if (!actEditorState) return null

    const act = acts.find((entry) => entry.id === actEditorState.actId) || null
    const mode = actEditorState.mode

    const modeLabels = {
        act: { icon: <Settings size={12} />, label: 'Act Config' },
        participant: { icon: <User size={12} />, label: 'Participant Binding' },
        relation: { icon: <ArrowRightLeft size={12} />, label: 'Relation' },
    }

    const { icon, label } = modeLabels[mode]

    return (
        <div className="act-panel">
            <div className="act-panel__header">
                <div className="act-panel__header-copy">
                    {icon}
                    <span>{label}</span>
                    {act ? <strong className="act-panel__header-name">{act.name}</strong> : null}
                </div>
                <button
                    className="icon-btn act-panel__close-btn"
                    title="Close Act Inspector"
                    onClick={closeActEditor}
                >
                    <X size={12} />
                </button>
            </div>
            {mode === 'act' && <ActMetaView />}
            {mode === 'participant' && <ActMetaView />}
            {mode === 'relation' && <ActRelationView />}
        </div>
    )
}
