/**
 * ActInspectorPanel — Right-side panel for the selected Act surface.
 *
 * It switches between:
 * - act meta/config
 * - participant binding
 * - relation detail
 */
import { Settings, User, ArrowRightLeft } from 'lucide-react'
import { useStudioStore } from '../../store'
import ActMetaView from './ActMetaView'
import ActParticipantBindingView from './ActParticipantBindingView'
import ActRelationView from './ActRelationView'
import './ActInspectorPanel.css'

export default function ActInspectorPanel() {
    const { layoutActId, selectedActId, selectedActParticipantKey, selectedRelationId } = useStudioStore()

    const activeActId = layoutActId || selectedActId
    if (!activeActId) return null

    const mode = selectedRelationId ? 'relation'
        : selectedActParticipantKey ? 'participant'
        : 'act'

    const modeLabels = {
        act: { icon: <Settings size={12} />, label: 'Act Config' },
        participant: { icon: <User size={12} />, label: 'Participant Binding' },
        relation: { icon: <ArrowRightLeft size={12} />, label: 'Relation' },
    }

    const { icon, label } = modeLabels[mode]

    return (
        <div className="act-panel">
            <div className="act-panel__header">
                {icon}
                <span>{label}</span>
            </div>
            {mode === 'act' && <ActMetaView />}
            {mode === 'participant' && <ActParticipantBindingView />}
            {mode === 'relation' && <ActRelationView />}
        </div>
    )
}
