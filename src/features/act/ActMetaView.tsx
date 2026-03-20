import { useEffect, useState } from 'react'
import {
    User, ArrowRightLeft, AlertTriangle,
} from 'lucide-react'
import { useStudioStore } from '../../store'
import { resolveActParticipantLabel } from './participant-labels'

export default function ActMetaView() {
    const {
        acts,
        actEditorState,
        renameAct,
        updateActAuthoringMeta,
        updateActDescription,
        autoLayoutActParticipants,
        openActParticipantEditor,
        openActRelationEditor,
        setAssetLibraryOpen,
        addRelation,
    } = useStudioStore()
    const updateActRules = useStudioStore((s) => s.updateActRules)
    const activeActId = actEditorState?.actId || null
    const act = acts.find((a) => a.id === activeActId)
    if (!act || !activeActId) return null

    const meta = act.meta?.authoring || {}
    const [localName, setLocalName] = useState(act.name)
    const [localDesc, setLocalDesc] = useState(act.description || meta.description || '')
    const [ruleInput, setRuleInput] = useState('')


    const participantKeys = Object.keys(act.participants)
    const [relationDraft, setRelationDraft] = useState<{
        source: string
        target: string
        direction: 'both' | 'one-way'
    }>({ source: '', target: '', direction: 'both' })



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

    const connectedKeys = new Set<string>()
    for (const relation of act.relations) {
        connectedKeys.add(relation.between[0])
        connectedKeys.add(relation.between[1])
    }
    const warnings: Array<{ type: 'error' | 'warning'; msg: string }> = []

    if (participantKeys.length === 0) {
        warnings.push({ type: 'warning', msg: 'No participants bound' })
    }
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
                                onClick={() => openActParticipantEditor(activeActId, key)}
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
                <label className="act-panel__label">Add Participant</label>
                <button
                    className="act-panel__toggle"
                    onClick={() => setAssetLibraryOpen(true)}
                >
                    Open Asset Library
                </button>
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Relations</label>
                {act.relations.length > 0 ? (
                    <div className="act-panel__list">
                        {act.relations.map((rel) => (
                            <button
                                key={rel.id}
                                className="act-panel__edge-link"
                                onClick={() => openActRelationEditor(activeActId, rel.id)}
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
                                openActRelationEditor(activeActId, relationId)
                            }
                        }}
                    >
                        Add Relation
                    </button>
                </div>
            )}

            <div className="act-panel__section">
                <label className="act-panel__label">Act Rules</label>
                <div className="act-panel__tags">
                    {(act.actRules || []).map((rule, index) => (
                        <span key={index} className="act-panel__tag" onClick={() => {
                            const updated = (act.actRules || []).filter((_, idx) => idx !== index)
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

            {warnings.length > 0 && (
                <div className="act-panel__section">
                    <label className="act-panel__label"><AlertTriangle size={11} /> Validation</label>
                    <div className="act-panel__validation">
                        {warnings.map((warning, index) => (
                            <div key={index} className={`act-panel__validation-item act-panel__validation-item--${warning.type}`}>
                                <span className="act-panel__validation-dot" />
                                {warning.msg}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {meta.tags && meta.tags.length > 0 && (
                <div className="act-panel__section">
                    <label className="act-panel__label">Tags</label>
                    <div className="act-panel__tags">
                        {meta.tags.map((tag, index) => (
                            <span key={index} className="act-panel__tag">{tag}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
