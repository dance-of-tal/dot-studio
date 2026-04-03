/**
 * ActInspectorPanel — Act editor surface.
 *
 * It switches between:
 * - act meta/config
 * - participant binding
 * - relation detail
 */
import { Settings, User, ArrowRightLeft, X } from 'lucide-react'
import { useStudioStore } from '../../store'
import '../performer/AgentFrame.css'
import ActMetaView from './ActMetaView'
import ActParticipantBindingView from './ActParticipantBindingView'
import ActRelationView from './ActRelationView'
import './ActInspectorPanel.css'
import './ActInspectorDetails.css'

type ActInspectorPanelProps = {
    embedded?: boolean
}

export default function ActInspectorPanel({ embedded = false }: ActInspectorPanelProps) {
    const { acts, actEditorState, closeActEditor } = useStudioStore()

    if (!actEditorState) return null

    const act = acts.find((entry) => entry.id === actEditorState.actId) || null
    const mode = actEditorState.mode

    const modeLabels = {
        act: { icon: <Settings size={12} />, label: 'Act Config' },
        participant: { icon: <User size={12} />, label: 'Participant' },
        relation: { icon: <ArrowRightLeft size={12} />, label: 'Relation' },
    }

    const { icon, label } = modeLabels[mode]

    return (
        <div className={`act-panel ${embedded ? 'act-panel--embedded' : ''}`}>
            {!embedded && (
                <div className="act-panel__header">
                    <div className="act-panel__header-copy">
                        {icon}
                        <span>{label}</span>
                        {act ? <strong className="act-panel__header-name">{act.name}</strong> : null}
                    </div>
                    <button
                        type="button"
                        className="icon-btn act-panel__close-btn"
                        title="Close Act Editor"
                        onClick={closeActEditor}
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
            {mode === 'act' && <ActMetaView />}
            {mode === 'participant' && <ActParticipantBindingView />}
            {mode === 'relation' && <ActRelationView />}
        </div>
    )
}
