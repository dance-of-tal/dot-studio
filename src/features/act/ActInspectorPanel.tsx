/**
 * ActInspectorPanel — Right-side panel for Act edit focus mode.
 *
 * Context-sensitive: shows Act meta when nothing selected,
 * Performer binding when a performer is selected,
 * Relation detail when a relation is selected.
 */
import { useState, useMemo, useEffect } from 'react'
import {
    Settings, User, ArrowRightLeft, Hexagon, Zap, Trash2,
    Clock, Hash, RefreshCw, RotateCcw,
    AlertTriangle,
} from 'lucide-react'
import { useStudioStore } from '../../store'
import type { ActRelation } from '../../types'
import './ActInspectorPanel.css'

// ── Act Meta View ───────────────────────────────────────
function ActMetaView() {
    const { acts, editingActId, renameAct, updateActAuthoringMeta, updateActDescription } = useStudioStore()
    const updateActRules = useStudioStore((s) => s.updateActRules)
    const act = acts.find((a) => a.id === editingActId)
    if (!act || !editingActId) return null

    const meta = act.meta?.authoring || {}
    const [localName, setLocalName] = useState(act.name)
    const [localDesc, setLocalDesc] = useState(act.description || meta.description || '')
    const [ruleInput, setRuleInput] = useState('')

    useEffect(() => {
        setLocalName(act.name)
        setLocalDesc(act.description || act.meta?.authoring?.description || '')
    }, [act.name, act.description, act.meta?.authoring?.description])

    const commitName = () => {
        if (localName.trim() && localName !== act.name) {
            renameAct(editingActId, localName.trim())
        }
    }

    const commitDesc = () => {
        updateActDescription(editingActId, localDesc)
        updateActAuthoringMeta(editingActId, {
            ...act.meta,
            authoring: { ...meta, description: localDesc },
        })
    }

    // ── Validation ──────────────────────────────────────
    const performerKeys = Object.keys(act.performers)
    const connectedKeys = new Set<string>()
    for (const rel of act.relations) {
        connectedKeys.add(rel.between[0])
        connectedKeys.add(rel.between[1])
    }
    const warnings: Array<{ type: 'error' | 'warning'; msg: string }> = []

    if (performerKeys.length === 0) {
        warnings.push({ type: 'warning', msg: 'No performers bound' })
    }
    // Disconnected performers
    for (const key of performerKeys) {
        if (!connectedKeys.has(key) && performerKeys.length > 1) {
            warnings.push({ type: 'warning', msg: `"${key}" is disconnected` })
        }
    }

    return (
        <div className="act-panel__content">
            <div className="act-panel__section">
                <label className="act-panel__label">Name</label>
                <input
                    className="act-panel__input"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => e.key === 'Enter' && commitName()}
                />
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Description</label>
                <textarea
                    className="act-panel__textarea"
                    value={localDesc}
                    onChange={(e) => setLocalDesc(e.target.value)}
                    onBlur={commitDesc}
                    placeholder="Describe the workflow this Act performs"
                    rows={3}
                />
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Summary</label>
                <div className="act-panel__stat-grid">
                    <div className="act-panel__stat">
                        <User size={12} />
                        <span>{performerKeys.length} performers</span>
                    </div>
                    <div className="act-panel__stat">
                        <ArrowRightLeft size={12} />
                        <span>{act.relations.length} relations</span>
                    </div>
                </div>
            </div>

            {/* Act Rules */}
            <div className="act-panel__section">
                <label className="act-panel__label">Act Rules</label>
                <div className="act-panel__tags">
                    {(act.actRules || []).map((rule, i) => (
                        <span key={i} className="act-panel__tag" onClick={() => {
                            const updated = (act.actRules || []).filter((_, idx) => idx !== i)
                            updateActRules(editingActId, updated)
                        }}>
                            {rule} ×
                        </span>
                    ))}
                </div>
                <div className="act-panel__sub-input-row">
                    <input
                        className="act-panel__input act-panel__input--small"
                        value={ruleInput}
                        onChange={(e) => setRuleInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && ruleInput.trim()) {
                                updateActRules(editingActId, [...(act.actRules || []), ruleInput.trim()])
                                setRuleInput('')
                            }
                        }}
                        placeholder="Add rule (e.g. 'All code must have tests')"
                    />
                </div>
            </div>

            {/* Validation */}
            {warnings.length > 0 && (
                <div className="act-panel__section">
                    <label className="act-panel__label"><AlertTriangle size={11} /> Validation</label>
                    <div className="act-panel__validation">
                        {warnings.map((w, i) => (
                            <div key={i} className={`act-panel__validation-item act-panel__validation-item--${w.type}`}>
                                <span className="act-panel__validation-dot" />
                                {w.msg}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {meta.tags && meta.tags.length > 0 && (
                <div className="act-panel__section">
                    <label className="act-panel__label">Tags</label>
                    <div className="act-panel__tags">
                        {meta.tags.map((tag, i) => (
                            <span key={i} className="act-panel__tag">{tag}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Performer Binding View ──────────────────────────────
function PerformerView() {
    const {
        acts, editingActId, selectedActPerformerKey,
        selectRelation, updatePerformerBinding,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    const binding = act && selectedActPerformerKey ? act.performers[selectedActPerformerKey] : null

    const relatedRelations = useMemo(() => {
        if (!act || !selectedActPerformerKey) return []
        return act.relations.filter(
            (r) => r.between.includes(selectedActPerformerKey),
        )
    }, [act, selectedActPerformerKey])

    const [subInput, setSubInput] = useState({ messagesFrom: '', messageTags: '', boardKeys: '' })

    if (!act || !binding || !selectedActPerformerKey || !editingActId) return null

    // Show performer ref info
    const refLabel = binding.performerRef.kind === 'registry'
        ? binding.performerRef.urn.split('/').pop() || binding.performerRef.urn
        : `Draft: ${binding.performerRef.draftId}`

    const subs = binding.subscriptions || {}

    const addSubItem = (field: keyof typeof subInput) => {
        const value = subInput[field].trim()
        if (!value) return
        const current = (subs as any)[field] || []
        if (current.includes(value)) return
        updatePerformerBinding(editingActId, selectedActPerformerKey, {
            subscriptions: { ...subs, [field]: [...current, value] },
        })
        setSubInput((prev) => ({ ...prev, [field]: '' }))
    }

    const removeSubItem = (field: string, value: string) => {
        const current = (subs as any)[field] || []
        updatePerformerBinding(editingActId, selectedActPerformerKey, {
            subscriptions: { ...subs, [field]: current.filter((v: string) => v !== value) },
        })
    }

    return (
        <div className="act-panel__content">
            {/* Performer binding summary */}
            <div className="act-panel__item-header">
                <User size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {selectedActPerformerKey}
                </span>
            </div>

            <div className="act-panel__section">
                <div className="act-panel__stat-grid">
                    <div className="act-panel__stat">
                        <Hexagon size={11} />
                        <span>{refLabel}</span>
                    </div>
                    {binding.activeDanceIds && binding.activeDanceIds.length > 0 && (
                        <div className="act-panel__stat">
                            <Zap size={11} />
                            <span>{binding.activeDanceIds.length} dance{binding.activeDanceIds.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Connected Relations */}
            <div className="act-panel__section">
                <label className="act-panel__label"><ArrowRightLeft size={11} /> Relations ({relatedRelations.length})</label>
                {relatedRelations.length > 0 ? (
                    <div className="act-panel__list">
                        {relatedRelations.map((rel) => {
                            const otherKey = rel.between[0] === selectedActPerformerKey ? rel.between[1] : rel.between[0]
                            return (
                                <div
                                    key={rel.id}
                                    className="act-panel__edge-link"
                                    onClick={() => selectRelation(rel.id)}
                                    title="Click to edit relation"
                                >
                                    <span className="act-panel__edge-dir">
                                        {rel.direction === 'both' ? '↔' : '→'}
                                    </span>
                                    <span className="act-panel__edge-target">{otherKey}</span>
                                    <span className="act-panel__edge-badge">
                                        {rel.direction}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <span className="act-panel__empty">No relations defined</span>
                )}
            </div>

            {/* Subscriptions (PRD §12.1) */}
            <div className="act-panel__section">
                <label className="act-panel__label">Subscriptions</label>

                {/* messagesFrom */}
                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Messages From</span>
                    <div className="act-panel__tags">
                        {(subs.messagesFrom || []).map((v) => (
                            <span key={v} className="act-panel__tag" onClick={() => removeSubItem('messagesFrom', v)}>
                                {v} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={subInput.messagesFrom}
                            onChange={(e) => setSubInput((p) => ({ ...p, messagesFrom: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSubItem('messagesFrom')}
                            placeholder="performer key"
                        />
                    </div>
                </div>

                {/* messageTags */}
                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Message Tags</span>
                    <div className="act-panel__tags">
                        {(subs.messageTags || []).map((v) => (
                            <span key={v} className="act-panel__tag" onClick={() => removeSubItem('messageTags', v)}>
                                {v} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={subInput.messageTags}
                            onChange={(e) => setSubInput((p) => ({ ...p, messageTags: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSubItem('messageTags')}
                            placeholder="tag name"
                        />
                    </div>
                </div>

                {/* boardKeys */}
                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Board Keys</span>
                    <div className="act-panel__tags">
                        {(subs.boardKeys || []).map((v) => (
                            <span key={v} className="act-panel__tag" onClick={() => removeSubItem('boardKeys', v)}>
                                {v} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={subInput.boardKeys}
                            onChange={(e) => setSubInput((p) => ({ ...p, boardKeys: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSubItem('boardKeys')}
                            placeholder="key pattern (e.g. api-spec, review-*)"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Relation View (Communication Contract) ──────────────
function RelationView() {
    const {
        acts, editingActId, selectedRelationId,
        updateRelation, removeRelation, selectRelation,
    } = useStudioStore()

    const act = acts.find((a) => a.id === editingActId)
    const relation = act?.relations.find((r) => r.id === selectedRelationId)

    const [form, setForm] = useState<Partial<ActRelation>>({})

    useEffect(() => {
        if (relation) {
            setForm({
                name: relation.name,
                description: relation.description,
                direction: relation.direction,
                sessionPolicy: relation.sessionPolicy,
                maxCalls: relation.maxCalls,
                timeout: relation.timeout,
            })
        }
    }, [relation])

    if (!relation || !act || !editingActId || !selectedRelationId) return null

    const update = (field: string, value: any) => {
        setForm((prev) => ({ ...prev, [field]: value }))
        updateRelation(editingActId, selectedRelationId, { [field]: value })
    }

    return (
        <div className="act-panel__content">
            {/* Header */}
            <div className="act-panel__item-header">
                <ArrowRightLeft size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {relation.between[0]} ↔ {relation.between[1]}
                </span>
                <button
                    className="icon-btn act-panel__danger-btn"
                    title="Delete relation"
                    onClick={() => {
                        removeRelation(editingActId, selectedRelationId)
                        selectRelation(null)
                    }}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {/* Name */}
            <div className="act-panel__section">
                <label className="act-panel__label"><Hash size={11} /> Name</label>
                <input
                    className="act-panel__input"
                    value={form.name || ''}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="communication_channel_name"
                />
            </div>

            {/* Description */}
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

            {/* Direction */}
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

            {/* Session Policy */}
            <div className="act-panel__section">
                <label className="act-panel__label"><RefreshCw size={11} /> Session</label>
                <div className="act-panel__toggle-group">
                    <button
                        className={`act-panel__toggle ${form.sessionPolicy === 'fresh' ? 'active' : ''}`}
                        onClick={() => update('sessionPolicy', 'fresh')}
                    >
                        Fresh
                    </button>
                    <button
                        className={`act-panel__toggle ${form.sessionPolicy === 'reuse' ? 'active' : ''}`}
                        onClick={() => update('sessionPolicy', 'reuse')}
                    >
                        Reuse
                    </button>
                </div>
            </div>

            {/* MaxCalls + Timeout */}
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
        </div>
    )
}

// ── Main Panel ──────────────────────────────────────────
export default function ActInspectorPanel() {
    const { editingActId, selectedActPerformerKey, selectedRelationId } = useStudioStore()

    if (!editingActId) return null

    // Determine which view to show
    const mode = selectedRelationId ? 'relation'
        : selectedActPerformerKey ? 'performer'
        : 'act'

    const modeLabels = {
        act: { icon: <Settings size={12} />, label: 'Act Settings' },
        performer: { icon: <User size={12} />, label: 'Performer Binding' },
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
            {mode === 'performer' && <PerformerView />}
            {mode === 'relation' && <RelationView />}
        </div>
    )
}
