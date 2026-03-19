import { useEffect, useState } from 'react'
import { ArrowRightLeft, Trash2, Hash, RotateCcw, Clock } from 'lucide-react'
import type { ActRelation } from '../../types'
import { useStudioStore } from '../../store'
import { resolveActParticipantLabel } from './participant-labels'

export default function ActRelationView() {
    const {
        acts, layoutActId, selectedActId, selectedRelationId,
        updateRelation, removeRelation, selectRelation,
    } = useStudioStore()

    const activeActId = layoutActId || selectedActId
    const act = acts.find((a) => a.id === activeActId)
    const relation = act?.relations.find((r) => r.id === selectedRelationId)

    const [form, setForm] = useState<Partial<ActRelation>>({})
    const [permissionInput, setPermissionInput] = useState({ callboardKeys: '', messageTags: '' })

    useEffect(() => {
        if (relation) {
            setForm({
                name: relation.name,
                description: relation.description,
                direction: relation.direction,
                maxCalls: relation.maxCalls,
                timeout: relation.timeout,
                sessionPolicy: relation.sessionPolicy,
            })
        }
    }, [relation])

    if (!relation || !act || !activeActId || !selectedRelationId) return null

    const update = (field: string, value: any) => {
        setForm((prev) => ({ ...prev, [field]: value }))
        updateRelation(activeActId, selectedRelationId, { [field]: value })
    }

    const permissions = relation.permissions || {}

    const addPermissionItem = (field: 'callboardKeys' | 'messageTags') => {
        const value = permissionInput[field].trim()
        if (!value) return
        const current = (permissions as any)[field] || []
        if (current.includes(value)) return
        updateRelation(activeActId, selectedRelationId, {
            permissions: {
                ...permissions,
                [field]: [...current, value],
            },
        })
        setPermissionInput((prev) => ({ ...prev, [field]: '' }))
    }

    const removePermissionItem = (field: 'callboardKeys' | 'messageTags', value: string) => {
        const current = (permissions as any)[field] || []
        updateRelation(activeActId, selectedRelationId, {
            permissions: {
                ...permissions,
                [field]: current.filter((entry: string) => entry !== value),
            },
        })
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
                        removeRelation(activeActId, selectedRelationId)
                        selectRelation(null)
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
                    placeholder="Communication contract description"
                    rows={2}
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

            <div className="act-panel__section">
                <label className="act-panel__label">Permissions</label>

                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Callboard Keys</span>
                    <div className="act-panel__tags">
                        {((permissions as any).callboardKeys || []).map((value: string) => (
                            <span key={value} className="act-panel__tag" onClick={() => removePermissionItem('callboardKeys', value)}>
                                {value} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={permissionInput.callboardKeys}
                            onChange={(e) => setPermissionInput((prev) => ({ ...prev, callboardKeys: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addPermissionItem('callboardKeys')}
                            placeholder="key pattern"
                        />
                    </div>
                </div>

                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Message Tags</span>
                    <div className="act-panel__tags">
                        {((permissions as any).messageTags || []).map((value: string) => (
                            <span key={value} className="act-panel__tag" onClick={() => removePermissionItem('messageTags', value)}>
                                {value} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={permissionInput.messageTags}
                            onChange={(e) => setPermissionInput((prev) => ({ ...prev, messageTags: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addPermissionItem('messageTags')}
                            placeholder="tag name"
                        />
                    </div>
                </div>
            </div>

            <div className="act-panel__row">
                <div className="act-panel__section act-panel__section--half">
                    <label className="act-panel__label"><RotateCcw size={11} /> Max Calls</label>
                    <input
                        className="act-panel__input act-panel__input--number"
                        type="number"
                        min={1}
                        max={100}
                        value={form.maxCalls ?? 10}
                        onChange={(e) => update('maxCalls', parseInt(e.target.value) || 10)}
                    />
                </div>
                <div className="act-panel__section act-panel__section--half">
                    <label className="act-panel__label"><Clock size={11} /> Timeout (s)</label>
                    <input
                        className="act-panel__input act-panel__input--number"
                        type="number"
                        min={10}
                        max={3600}
                        value={form.timeout ?? 300}
                        onChange={(e) => update('timeout', parseInt(e.target.value) || 300)}
                    />
                </div>
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Session Policy</label>
                <div className="act-panel__toggle-group">
                    <button
                        className={`act-panel__toggle ${form.sessionPolicy !== 'fresh' ? 'active' : ''}`}
                        onClick={() => update('sessionPolicy', 'reuse')}
                    >
                        Reuse
                    </button>
                    <button
                        className={`act-panel__toggle ${form.sessionPolicy === 'fresh' ? 'active' : ''}`}
                        onClick={() => update('sessionPolicy', 'fresh')}
                    >
                        Fresh
                    </button>
                </div>
            </div>
        </div>
    )
}
