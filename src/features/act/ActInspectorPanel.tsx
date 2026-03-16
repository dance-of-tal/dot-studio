/**
 * ActInspectorPanel — Right-side panel for Act edit focus mode.
 *
 * Context-sensitive: shows Act meta when nothing selected,
 * Performer detail when a performer is selected,
 * Edge detail when an edge/relation is selected.
 */
import { useState, useMemo, useEffect } from 'react'
import {
    Settings, User, ArrowRightLeft, Cpu, Hexagon, Zap, Trash2,
    Clock, Hash, Phone, PhoneForwarded, RefreshCw, RotateCcw,
} from 'lucide-react'
import { useStudioStore } from '../../store'
import type { ActRelation } from '../../types'
import './ActInspectorPanel.css'

// ── Act Meta View ───────────────────────────────────────
function ActMetaView() {
    const { acts, editingActId, renameAct, updateActAuthoringMeta } = useStudioStore()
    const act = acts.find((a) => a.id === editingActId)
    if (!act || !editingActId) return null

    const meta = act.meta?.authoring || {}
    const [localName, setLocalName] = useState(act.name)
    const [localDesc, setLocalDesc] = useState(meta.description || '')

    useEffect(() => {
        setLocalName(act.name)
        setLocalDesc(act.meta?.authoring?.description || '')
    }, [act.name, act.meta?.authoring?.description])

    const commitName = () => {
        if (localName.trim() && localName !== act.name) {
            renameAct(editingActId, localName.trim())
        }
    }

    const commitDesc = () => {
        updateActAuthoringMeta(editingActId, {
            ...act.meta,
            authoring: { ...meta, description: localDesc },
        })
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
                    placeholder="이 Act가 수행하는 워크플로우를 설명하세요"
                    rows={3}
                />
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Summary</label>
                <div className="act-panel__stat-grid">
                    <div className="act-panel__stat">
                        <User size={12} />
                        <span>{Object.keys(act.performers).length} performers</span>
                    </div>
                    <div className="act-panel__stat">
                        <ArrowRightLeft size={12} />
                        <span>{act.relations.length} edges</span>
                    </div>
                </div>
            </div>

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

// ── Performer View (summary + edge nav) ─────────────────
function PerformerView() {
    const {
        acts, editingActId, selectedActPerformerKey,
        selectRelation, drafts,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    const performer = act && selectedActPerformerKey ? act.performers[selectedActPerformerKey] : null

    const relatedRelations = useMemo(() => {
        if (!act || !selectedActPerformerKey) return []
        return act.relations.filter(
            (r) => r.from === selectedActPerformerKey || r.to === selectedActPerformerKey,
        )
    }, [act, selectedActPerformerKey])

    if (!act || !performer || !selectedActPerformerKey || !editingActId) return null

    const modelLabel = performer.model
        ? `${performer.model.provider}/${performer.model.modelId}`
        : 'No model'
    const talLabel = performer.talRef
        ? performer.talRef.kind === 'draft'
            ? drafts[performer.talRef.draftId]?.name || 'Draft Tal'
            : performer.talRef.urn.split('/').pop() || performer.talRef.urn
        : null

    const getPerformerName = (key: string) => act.performers[key]?.name || key

    return (
        <div className="act-panel__content">
            {/* Performer summary */}
            <div className="act-panel__item-header">
                <User size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {performer.name}
                </span>
            </div>

            {/* Quick config badges */}
            <div className="act-panel__section">
                <div className="act-panel__stat-grid">
                    <div className="act-panel__stat">
                        <Cpu size={11} />
                        <span>{modelLabel}</span>
                    </div>
                    {talLabel && (
                        <div className="act-panel__stat">
                            <Hexagon size={11} />
                            <span>{talLabel}</span>
                        </div>
                    )}
                    {performer.danceRefs.length > 0 && (
                        <div className="act-panel__stat">
                            <Zap size={11} />
                            <span>{performer.danceRefs.length} dance{performer.danceRefs.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Connected Edges — clickable to navigate */}
            <div className="act-panel__section">
                <label className="act-panel__label"><ArrowRightLeft size={11} /> Edges ({relatedRelations.length})</label>
                {relatedRelations.length > 0 ? (
                    <div className="act-panel__list">
                        {relatedRelations.map((rel) => {
                            const isFrom = rel.from === selectedActPerformerKey
                            const otherKey = isFrom ? rel.to : rel.from
                            return (
                                <div
                                    key={rel.id}
                                    className="act-panel__edge-link"
                                    onClick={() => selectRelation(rel.id)}
                                    title="Click to edit edge"
                                >
                                    <span className="act-panel__edge-dir">{isFrom ? '→' : '←'}</span>
                                    <span className="act-panel__edge-target">{getPerformerName(otherKey)}</span>
                                    <span className={`act-panel__edge-badge act-panel__edge-badge--${rel.invocation}`}>
                                        {rel.invocation}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <span className="act-panel__empty">Drag handles to connect</span>
                )}
            </div>
        </div>
    )
}

// ── Edge View ───────────────────────────────────────────
function EdgeView() {
    const {
        acts, editingActId, selectedRelationId,
        updateRelation, removeRelationFromAct, selectRelation,
    } = useStudioStore()

    const act = acts.find((a) => a.id === editingActId)
    const relation = act?.relations.find((r) => r.id === selectedRelationId)

    const [form, setForm] = useState<Partial<ActRelation>>({})

    useEffect(() => {
        if (relation) {
            setForm({
                name: relation.name,
                description: relation.description,
                invocation: relation.invocation,
                await: relation.await,
                sessionPolicy: relation.sessionPolicy,
                maxCalls: relation.maxCalls,
                timeout: relation.timeout,
            })
        }
    }, [relation])

    if (!relation || !act || !editingActId || !selectedRelationId) return null

    const fromPerf = act.performers[relation.from]
    const toPerf = act.performers[relation.to]

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
                    {fromPerf?.name || '?'} → {toPerf?.name || '?'}
                </span>
                <button
                    className="icon-btn act-panel__danger-btn"
                    title="Delete edge"
                    onClick={() => {
                        removeRelationFromAct(editingActId, selectedRelationId)
                        selectRelation(null)
                    }}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {/* Tool Name */}
            <div className="act-panel__section">
                <label className="act-panel__label"><Hash size={11} /> Tool Name</label>
                <input
                    className="act-panel__input"
                    value={form.name || ''}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="request_code_review"
                />
            </div>

            {/* Description */}
            <div className="act-panel__section">
                <label className="act-panel__label">Description</label>
                <textarea
                    className="act-panel__textarea"
                    value={form.description || ''}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="LLM이 보는 tool 설명"
                    rows={2}
                />
            </div>

            {/* Invocation */}
            <div className="act-panel__section">
                <label className="act-panel__label"><Phone size={11} /> Invocation</label>
                <div className="act-panel__toggle-group">
                    <button
                        className={`act-panel__toggle ${form.invocation === 'optional' ? 'active' : ''}`}
                        onClick={() => update('invocation', 'optional')}
                    >
                        <PhoneForwarded size={12} /> Optional
                    </button>
                    <button
                        className={`act-panel__toggle ${form.invocation === 'required' ? 'active' : ''}`}
                        onClick={() => update('invocation', 'required')}
                    >
                        <Phone size={12} /> Required
                    </button>
                </div>
                <span className="act-panel__hint">
                    {form.invocation === 'required'
                        ? 'LLM must use this tool before completing'
                        : 'LLM may use this tool when useful'}
                </span>
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

            {/* Await */}
            <div className="act-panel__section">
                <label className="act-panel__label act-panel__label--checkbox">
                    <input
                        type="checkbox"
                        checked={form.await ?? true}
                        onChange={(e) => update('await', e.target.checked)}
                    />
                    Await Result
                </label>
                <span className="act-panel__hint">
                    {form.await ? 'Caller waits for response' : 'Fire-and-forget mode'}
                </span>
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
    const mode = selectedRelationId ? 'edge'
        : selectedActPerformerKey ? 'performer'
        : 'act'

    const modeLabels = {
        act: { icon: <Settings size={12} />, label: 'Act Settings' },
        performer: { icon: <User size={12} />, label: 'Performer' },
        edge: { icon: <ArrowRightLeft size={12} />, label: 'Edge' },
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
            {mode === 'edge' && <EdgeView />}
        </div>
    )
}
