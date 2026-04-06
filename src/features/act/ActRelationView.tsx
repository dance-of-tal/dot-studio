import { ArrowRightLeft, ChevronLeft, Trash2, Hash } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ActRelation } from '../../types'
import { useStudioStore } from '../../store'
import { resolveActParticipantLabel } from './participant-labels'
import Tip from './Tip'

type EditableRelationField = 'name' | 'description' | 'direction'

export default function ActRelationView() {
    const {
        acts, performers, actEditorState,
        updateRelation, removeRelation, openActEditor,
    } = useStudioStore(useShallow((state) => ({
        acts: state.acts,
        performers: state.performers,
        actEditorState: state.actEditorState,
        updateRelation: state.updateRelation,
        removeRelation: state.removeRelation,
        openActEditor: state.openActEditor,
    })))

    const activeActId = actEditorState?.actId || null
    const relationId = actEditorState?.mode === 'relation' ? actEditorState.relationId : null
    const act = acts.find((a) => a.id === activeActId)
    const relation = act?.relations.find((r) => r.id === relationId)

    if (!relation || !act || !activeActId || !relationId) return null

    const update = <K extends EditableRelationField>(field: K, value: ActRelation[K]) => {
        updateRelation(activeActId, relationId, { [field]: value } as Partial<ActRelation>)
    }

    return (
        <div className="act-panel__content act-panel__content--detail">
            <div className="act-panel__item-header">
                <button
                    type="button"
                    className="icon-btn"
                    title="Back to Act Config"
                    onClick={() => openActEditor(activeActId, 'act')}
                >
                    <ChevronLeft size={12} />
                </button>
                <ArrowRightLeft size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {resolveActParticipantLabel(act, relation.between[0], performers)} ↔ {resolveActParticipantLabel(act, relation.between[1], performers)}
                </span>
                <button
                    type="button"
                    className="icon-btn act-panel__danger-btn"
                    title="Delete relation"
                    onClick={() => {
                        removeRelation(activeActId, relationId)
                        openActEditor(activeActId, 'act')
                    }}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <div className="act-panel__detail-stack">
                <div className="act-panel__section act-panel__section--card">
                    <label className="act-panel__label"><ArrowRightLeft size={11} /> Endpoints</label>
                    <div className="act-panel__relation-summary">
                        <span className="act-panel__endpoint-chip">{resolveActParticipantLabel(act, relation.between[0], performers)}</span>
                        <span className="act-panel__edge-dir act-panel__edge-dir--large">
                            {relation.direction === 'one-way' ? '→' : '↔'}
                        </span>
                        <span className="act-panel__endpoint-chip">{resolveActParticipantLabel(act, relation.between[1], performers)}</span>
                    </div>
                </div>

                <div className="act-panel__section act-panel__section--card">
                    <label className="act-panel__label">
                        <Hash size={11} /> Name
                        <Tip text="The relation name is used by agents to identify this communication channel. Use a clear, machine-readable name like 'code_review' or 'design_feedback'." />
                    </label>
                    <input
                        className="act-panel__input"
                        value={relation.name}
                        onChange={(e) => update('name', e.target.value)}
                        placeholder="communication_channel_name"
                    />
                </div>

                <div className="act-panel__section act-panel__section--card">
                    <label className="act-panel__label">
                        Description
                        <Tip text="This description is injected into each participant's agent context. Write a clear purpose statement so agents understand when and how to use this communication channel." />
                    </label>
                    <textarea
                        className="act-panel__textarea"
                        value={relation.description}
                        onChange={(e) => update('description', e.target.value)}
                        placeholder="Describe the purpose of this relation so agents know when to use it."
                        rows={3}
                    />
                </div>

                <div className="act-panel__section act-panel__section--card">
                    <label className="act-panel__label">
                        <ArrowRightLeft size={11} /> Direction
                        <Tip text="'Both' allows messaging in either direction. 'One-way' restricts communication to the arrow direction only." />
                    </label>
                    <div className="act-panel__toggle-group">
                        <button
                            type="button"
                            className={`act-panel__toggle ${relation.direction === 'both' ? 'active' : ''}`}
                            onClick={() => update('direction', 'both')}
                        >
                            Both
                        </button>
                        <button
                            type="button"
                            className={`act-panel__toggle ${relation.direction === 'one-way' ? 'active' : ''}`}
                            onClick={() => update('direction', 'one-way')}
                        >
                            One-way
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
