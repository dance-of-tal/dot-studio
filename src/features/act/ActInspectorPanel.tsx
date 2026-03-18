/**
 * ActInspectorPanel — Right-side panel for selected or focused Acts.
 *
 * Context-sensitive: shows Act meta when nothing selected,
 * Participant binding when a performer is selected,
 * Relation detail when a relation is selected.
 */
import { useState, useMemo, useEffect } from 'react'
import {
    Settings, User, ArrowRightLeft, Hexagon, Zap, Trash2,
    Clock, Hash, RotateCcw,
    AlertTriangle,
} from 'lucide-react'
import { useStudioStore } from '../../store'
import type { ActRelation, PerformerNode } from '../../types'
import { resolveActParticipantLabel } from './participant-labels'
import './ActInspectorPanel.css'

function getCallboardKeys(subs: any) {
    return subs.callboardKeys || subs.boardKeys || []
}

function nextSubscriptions(subs: any, patch: Record<string, unknown>) {
    const next = { ...subs, ...patch }
    if ('callboardKeys' in patch) {
        next.boardKeys = patch.callboardKeys
    }
    return next
}

function isPerformerAttachedToAct(act: any, performer: PerformerNode) {
    const derivedFrom = performer.meta?.derivedFrom?.trim()
    return Object.values(act.performers).some((binding: any) => (
        (binding.performerRef.kind === 'draft' && binding.performerRef.draftId === performer.id)
        || (binding.performerRef.kind === 'registry' && !!derivedFrom && binding.performerRef.urn === derivedFrom)
    ))
}

// ── Act Meta View ───────────────────────────────────────
function ActMetaView() {
    const {
        acts,
        layoutActId,
        selectedActId,
        renameAct,
        updateActAuthoringMeta,
        updateActDescription,
        performers,
        autoLayoutActParticipants,
        selectActParticipant,
        selectRelation,
        setAssetLibraryOpen,
        addRelation,
        attachPerformerToAct,
    } = useStudioStore()
    const updateActRules = useStudioStore((s) => s.updateActRules)
    const activeActId = layoutActId || selectedActId
    const act = acts.find((a) => a.id === activeActId)
    if (!act || !activeActId) return null

    const meta = act.meta?.authoring || {}
    const [localName, setLocalName] = useState(act.name)
    const [localDesc, setLocalDesc] = useState(act.description || meta.description || '')
    const [ruleInput, setRuleInput] = useState('')
    const [participantDraftId, setParticipantDraftId] = useState('')
    const [relationDraft, setRelationDraft] = useState<{
        source: string
        target: string
        direction: 'both' | 'one-way'
    }>({ source: '', target: '', direction: 'both' })

    const availablePerformers = useMemo(
        () => performers.filter((performer) => performer.scope === 'shared' && performer.id !== 'studio-assistant' && !isPerformerAttachedToAct(act, performer)),
        [act, performers],
    )

    useEffect(() => {
        setLocalName(act.name)
        setLocalDesc(act.description || act.meta?.authoring?.description || '')
    }, [act.name, act.description, act.meta?.authoring?.description])

    useEffect(() => {
        const [first = '', second = ''] = participantKeys
        setRelationDraft((current) => ({
            source: participantKeys.includes(current.source) ? current.source : first,
            target: participantKeys.includes(current.target) && current.target !== current.source
                ? current.target
                : second || first,
            direction: current.direction,
        }))
    }, [act.id, participantKeys.join('|')])

    const commitName = () => {
        if (localName.trim() && localName !== act.name) {
            renameAct(activeActId, localName.trim())
        }
    }

    const commitDesc = () => {
        updateActDescription(activeActId, localDesc)
        updateActAuthoringMeta(activeActId, {
            ...act.meta,
            authoring: { ...meta, description: localDesc },
        })
    }

    // ── Validation ──────────────────────────────────────
    const participantKeys = Object.keys(act.performers)
    const connectedKeys = new Set<string>()
    for (const rel of act.relations) {
        connectedKeys.add(rel.between[0])
        connectedKeys.add(rel.between[1])
    }
    const warnings: Array<{ type: 'error' | 'warning'; msg: string }> = []

    if (participantKeys.length === 0) {
        warnings.push({ type: 'warning', msg: 'No participants bound' })
    }
    // Disconnected participants
    for (const key of participantKeys) {
        if (!connectedKeys.has(key) && participantKeys.length > 1) {
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
                        <span>{participantKeys.length} participants</span>
                    </div>
                    <div className="act-panel__stat">
                        <ArrowRightLeft size={12} />
                        <span>{act.relations.length} relations</span>
                    </div>
                </div>
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Participants</label>
                {participantKeys.length > 0 ? (
                    <div className="act-panel__list">
                        {participantKeys.map((key) => (
                            <button
                                key={key}
                                className="act-panel__edge-link"
                                onClick={() => selectActParticipant(key)}
                                title="Open participant binding"
                            >
                                <span className="act-panel__edge-dir">●</span>
                                <span className="act-panel__edge-target">{resolveActParticipantLabel(act, key, useStudioStore.getState().performers)}</span>
                                <span className="act-panel__edge-badge">binding</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="act-panel__list">
                        <span className="act-panel__empty">No participants bound yet</span>
                        <button
                            className="act-panel__toggle"
                            onClick={() => {
                                setAssetLibraryOpen(true)
                            }}
                        >
                            Open Asset Library
                        </button>
                    </div>
                )}
                {participantKeys.length > 1 && (
                    <button
                        className="act-panel__toggle"
                        onClick={() => autoLayoutActParticipants(activeActId)}
                    >
                        Auto Layout
                    </button>
                )}
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Add Existing Performer</label>
                {availablePerformers.length > 0 ? (
                    <>
                        <select
                            className="act-panel__input"
                            value={participantDraftId}
                            onChange={(e) => setParticipantDraftId(e.target.value)}
                        >
                            <option value="">Choose a performer…</option>
                            {availablePerformers.map((performer) => (
                                <option key={performer.id} value={performer.id}>{performer.name}</option>
                            ))}
                        </select>
                        <button
                            className="act-panel__toggle"
                            onClick={() => {
                                if (!participantDraftId) return
                                attachPerformerToAct(activeActId, participantDraftId)
                                setParticipantDraftId('')
                            }}
                        >
                            Add Participant
                        </button>
                    </>
                ) : (
                    <span className="act-panel__empty">No standalone performers available to attach</span>
                )}
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Relations</label>
                {act.relations.length > 0 ? (
                    <div className="act-panel__list">
                        {act.relations.map((rel) => (
                            <button
                                key={rel.id}
                                className="act-panel__edge-link"
                                onClick={() => selectRelation(rel.id)}
                                title="Open relation"
                            >
                                <span className="act-panel__edge-dir">
                                    {rel.direction === 'both' ? '↔' : '→'}
                                </span>
                                <span className="act-panel__edge-target">
                                    {resolveActParticipantLabel(act, rel.between[0], useStudioStore.getState().performers)}
                                    {' · '}
                                    {resolveActParticipantLabel(act, rel.between[1], useStudioStore.getState().performers)}
                                </span>
                                <span className="act-panel__edge-badge">
                                    {rel.name || 'relation'}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <span className="act-panel__empty">No relations yet</span>
                )}
            </div>

            {participantKeys.length >= 2 && (
                <div className="act-panel__section">
                    <label className="act-panel__label">Quick Relation</label>
                    <div className="act-panel__row">
                        <div className="act-panel__section act-panel__section--half">
                            <label className="act-panel__label">From</label>
                            <select
                                className="act-panel__input"
                                value={relationDraft.source}
                                onChange={(e) => setRelationDraft((current) => ({ ...current, source: e.target.value }))}
                            >
                                {participantKeys.map((key) => (
                                    <option key={key} value={key}>{resolveActParticipantLabel(act, key, useStudioStore.getState().performers)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="act-panel__section act-panel__section--half">
                            <label className="act-panel__label">To</label>
                            <select
                                className="act-panel__input"
                                value={relationDraft.target}
                                onChange={(e) => setRelationDraft((current) => ({ ...current, target: e.target.value }))}
                            >
                                {participantKeys.map((key) => (
                                    <option key={key} value={key}>{resolveActParticipantLabel(act, key, useStudioStore.getState().performers)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="act-panel__toggle-group">
                        <button
                            className={`act-panel__toggle ${relationDraft.direction === 'both' ? 'active' : ''}`}
                            onClick={() => setRelationDraft((current) => ({ ...current, direction: 'both' }))}
                        >
                            Both
                        </button>
                        <button
                            className={`act-panel__toggle ${relationDraft.direction === 'one-way' ? 'active' : ''}`}
                            onClick={() => setRelationDraft((current) => ({ ...current, direction: 'one-way' }))}
                        >
                            One-way
                        </button>
                    </div>
                    <button
                        className="act-panel__toggle"
                        onClick={() => {
                            if (!relationDraft.source || !relationDraft.target || relationDraft.source === relationDraft.target) {
                                return
                            }
                            const relationId = addRelation(activeActId, [relationDraft.source, relationDraft.target], relationDraft.direction)
                            if (relationId) {
                                selectRelation(relationId)
                            }
                        }}
                    >
                        Add Relation
                    </button>
                </div>
            )}

            {/* Act Rules */}
            <div className="act-panel__section">
                <label className="act-panel__label">Act Rules</label>
                <div className="act-panel__tags">
                    {(act.actRules || []).map((rule, i) => (
                        <span key={i} className="act-panel__tag" onClick={() => {
                            const updated = (act.actRules || []).filter((_, idx) => idx !== i)
                            updateActRules(activeActId, updated)
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
                                updateActRules(activeActId, [...(act.actRules || []), ruleInput.trim()])
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

// ── Participant Binding View ────────────────────────────
function ParticipantView() {
    const {
        acts, performers, layoutActId, selectedActId, selectedActParticipantKey,
        selectRelation, updatePerformerBinding, unbindPerformerFromAct, selectActParticipant,
    } = useStudioStore()

    const activeActId = layoutActId || selectedActId
    const act = useMemo(() => acts.find((a) => a.id === activeActId), [acts, activeActId])
    const binding = act && selectedActParticipantKey ? act.performers[selectedActParticipantKey] : null

    const relatedRelations = useMemo(() => {
        if (!act || !selectedActParticipantKey) return []
        return act.relations.filter(
            (r) => r.between.includes(selectedActParticipantKey),
        )
    }, [act, selectedActParticipantKey])

    const [subInput, setSubInput] = useState({ messagesFrom: '', messageTags: '', callboardKeys: '' })

    if (!act || !binding || !selectedActParticipantKey || !activeActId) return null

    // Show participant ref info
    const refLabel = binding.performerRef.kind === 'registry'
        ? binding.performerRef.urn.split('/').pop() || binding.performerRef.urn
        : `Draft: ${binding.performerRef.draftId}`

    const subs = binding.subscriptions || {}

    const addSubItem = (field: keyof typeof subInput) => {
        const value = subInput[field].trim()
        if (!value) return
        const current = field === 'callboardKeys'
            ? getCallboardKeys(subs)
            : (subs as any)[field] || []
        if (current.includes(value)) return
        updatePerformerBinding(activeActId, selectedActParticipantKey, {
            subscriptions: nextSubscriptions(subs, { [field]: [...current, value] }),
        })
        setSubInput((prev) => ({ ...prev, [field]: '' }))
    }

    const removeSubItem = (field: string, value: string) => {
        const current = field === 'callboardKeys'
            ? getCallboardKeys(subs)
            : (subs as any)[field] || []
        updatePerformerBinding(activeActId, selectedActParticipantKey, {
            subscriptions: nextSubscriptions(subs, { [field]: current.filter((v: string) => v !== value) }),
        })
    }

    return (
        <div className="act-panel__content">
            {/* Participant binding summary */}
            <div className="act-panel__item-header">
                <User size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {resolveActParticipantLabel(act, selectedActParticipantKey, performers)}
                </span>
                <button
                    className="icon-btn act-panel__danger-btn"
                    title="Remove participant"
                    onClick={() => {
                        unbindPerformerFromAct(activeActId, selectedActParticipantKey)
                        selectActParticipant(null)
                    }}
                >
                    <Trash2 size={12} />
                </button>
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

            {/* Active Dances (PRD §10.2) */}
            <div className="act-panel__section">
                <label className="act-panel__label"><Zap size={11} /> Active Dances</label>
                {(() => {
                    const ref = binding.performerRef
                    const resolved = ref.kind === 'draft'
                        ? performers.find((p) => p.id === ref.draftId)
                        : performers.find((p) => p.meta?.derivedFrom === ref.urn)
                    const availableDances = resolved?.danceRefs || []
                    const activeIds = binding.activeDanceIds || []

                    const toggleDance = (danceUrn: string) => {
                        const current = binding.activeDanceIds || []
                        const next = current.includes(danceUrn)
                            ? current.filter((id) => id !== danceUrn)
                            : [...current, danceUrn]
                        updatePerformerBinding(activeActId!, selectedActParticipantKey!, {
                            activeDanceIds: next,
                        })
                    }

                    if (availableDances.length === 0) {
                        return <span className="act-panel__empty">No dances on this participant</span>
                    }

                    return (
                        <div className="act-panel__list">
                            {availableDances.map((dRef) => {
                                const urn = dRef.kind === 'registry' ? dRef.urn : dRef.draftId
                                const dLabel = dRef.kind === 'registry'
                                    ? (dRef.urn.split('/').pop() || dRef.urn)
                                    : `draft:${dRef.draftId}`
                                const isActive = activeIds.includes(urn)
                                return (
                                    <label
                                        key={urn}
                                        className={`act-panel__dance-toggle ${isActive ? 'active' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={() => toggleDance(urn)}
                                        />
                                        <Zap size={10} />
                                        <span>{dLabel}</span>
                                    </label>
                                )
                            })}
                        </div>
                    )
                })()}
            </div>

            {/* Connected Relations */}
            <div className="act-panel__section">
                <label className="act-panel__label"><ArrowRightLeft size={11} /> Relations ({relatedRelations.length})</label>
                {relatedRelations.length > 0 ? (
                    <div className="act-panel__list">
                        {relatedRelations.map((rel) => {
                            const otherKey = rel.between[0] === selectedActParticipantKey ? rel.between[1] : rel.between[0]
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
                                    <span className="act-panel__edge-target">{resolveActParticipantLabel(act, otherKey, performers)}</span>
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
                            placeholder="participant key"
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

                {/* callboardKeys */}
                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Callboard Keys</span>
                    <div className="act-panel__tags">
                        {getCallboardKeys(subs).map((v: string) => (
                            <span key={v} className="act-panel__tag" onClick={() => removeSubItem('callboardKeys', v)}>
                                {v} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={subInput.callboardKeys}
                            onChange={(e) => setSubInput((p) => ({ ...p, callboardKeys: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSubItem('callboardKeys')}
                            placeholder="key pattern (e.g. launch-brief, signal-*)"
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
                ...(field === 'callboardKeys'
                    ? { boardKeys: [...current, value] }
                    : {}),
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
                ...(field === 'callboardKeys'
                    ? { boardKeys: current.filter((entry: string) => entry !== value) }
                    : {}),
            },
        })
    }

    return (
        <div className="act-panel__content">
            {/* Header */}
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

            <div className="act-panel__section">
                <label className="act-panel__label">Permissions</label>

                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Callboard Keys</span>
                    <div className="act-panel__tags">
                        {((permissions as any).callboardKeys || (permissions as any).boardKeys || []).map((v: string) => (
                            <span key={v} className="act-panel__tag" onClick={() => removePermissionItem('callboardKeys', v)}>
                                {v} ×
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
                        {((permissions as any).messageTags || []).map((v: string) => (
                            <span key={v} className="act-panel__tag" onClick={() => removePermissionItem('messageTags', v)}>
                                {v} ×
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

// ── Main Panel ──────────────────────────────────────────
export default function ActInspectorPanel() {
    const { layoutActId, selectedActId, selectedActParticipantKey, selectedRelationId } = useStudioStore()

    const activeActId = layoutActId || selectedActId
    if (!activeActId) return null

    // Determine which view to show
    const mode = selectedRelationId ? 'relation'
        : selectedActParticipantKey ? 'performer'
        : 'act'

    const modeLabels = {
        act: { icon: <Settings size={12} />, label: 'Act Config' },
        performer: { icon: <User size={12} />, label: 'Participant Binding' },
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
            {mode === 'performer' && <ParticipantView />}
            {mode === 'relation' && <RelationView />}
        </div>
    )
}
