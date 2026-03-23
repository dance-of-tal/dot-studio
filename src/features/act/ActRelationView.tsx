import { useEffect, useState } from 'react'
import { ArrowRightLeft, Trash2, Hash } from 'lucide-react'
import type { ActRelation } from '../../types'
import { useStudioStore } from '../../store'
import { resolveActParticipantLabel } from './participant-labels'

type EditableRelationField = 'name' | 'description' | 'direction'

export default function ActRelationView() {
    const {
        acts, actEditorState,
        updateRelation, removeRelation, openActEditor,
    } = useStudioStore()

    const activeActId = actEditorState?.actId || null
    const relationId = actEditorState?.mode === 'relation' ? actEditorState.relationId : null
    const act = acts.find((a) => a.id === activeActId)
    const relation = act?.relations.find((r) => r.id === relationId)

    const [form, setForm] = useState<Partial<ActRelation>>({})

    useEffect(() => {
        if (relation) {
            setForm({
                name: relation.name,
                description: relation.description,
                direction: relation.direction,
            })
        }
    }, [relation])

    if (!relation || !act || !activeActId || !relationId) return null

    const update = <K extends EditableRelationField>(field: K, value: ActRelation[K]) => {
        setForm((prev) => ({ ...prev, [field]: value }))
        updateRelation(activeActId, relationId, { [field]: value } as Partial<ActRelation>)
    }

    return (
        <div className="act-panel__content">
            <div className="act-panel__item-header">
                <ArrowRightLeft size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {resolveActParticipantLabel(act, relation.between[0], useStudioStore.getState().performers)} ↔ {resolveActParticipantLabel(act, relation.between[1], useStudioStore.getState().performers)}
                </span>
                <button
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

            <div className="act-panel__section">
                <label className="act-panel__label"><Hash size={11} /> Name</label>
                <input
                    className="act-panel__input"
                    value={form.name || ''}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="communication_channel_name"
                />
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Description</label>
                <textarea
                    className="act-panel__textarea"
                    value={form.description || ''}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="이 관계의 목적을 기술하세요. Agent가 이 설명을 읽고 통신 목적을 판단합니다."
                    rows={3}
                />
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label"><ArrowRightLeft size={11} /> Direction</label>
                <div className="act-panel__toggle-group">
                    <button
                        className={`act-panel__toggle ${form.direction === 'both' ? 'active' : ''}`}
                        onClick={() => update('direction', 'both')}
                    >
                        Both
                    </button>
                    <button
                        className={`act-panel__toggle ${form.direction === 'one-way' ? 'active' : ''}`}
                        onClick={() => update('direction', 'one-way')}
                    >
                        One-way
                    </button>
                </div>
            </div>
        </div>
    )
}
