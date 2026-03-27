import { useEffect, useState, useMemo } from 'react'
import {
    User, ArrowRightLeft, AlertTriangle, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { useStudioStore } from '../../store'
import { resolveActParticipantLabel } from './participant-labels'
import { evaluateActReadiness } from './act-readiness'
import ActSafetyEditor from './ActSafetyEditor'
import Tip from './Tip'

export default function ActMetaView() {
    const {
        acts, performers,
        actEditorState,
        renameAct,
        updateActAuthoringMeta,
        updateActDescription,
        openActRelationEditor,
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

    useEffect(() => {
        setLocalName(act.name)
        setLocalDesc(act.description || act.meta?.authoring?.description || '')
    }, [act.name, act.description, act.meta?.authoring?.description])

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

    const readiness = useMemo(
        () => evaluateActReadiness(act, performers),
        [act, performers],
    )

    return (
        <div className="act-panel__content">
            <div className="act-panel__section">
                <label className="act-panel__label">
                    Name
                    <Tip text="The Act name is visible to all participant agents. Use a clear, descriptive name so agents can understand the workflow context." />
                </label>
                <input
                    className="act-panel__input"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => e.key === 'Enter' && commitName()}
                />
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">
                    Description
                    <Tip text="This description is injected into each participant agent's context. Write a clear purpose statement so agents understand what this workflow does and how they should collaborate." />
                </label>
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
                <label className="act-panel__label">
                    Participants
                    <Tip text="Each participant is an agent in this workflow. Participant names are visible to other agents for messaging and collaboration." />
                </label>
                {participantKeys.length > 0 ? (
                    <div className="act-panel__list">
                        {participantKeys.map((key) => (
                            <div
                                key={key}
                                className="act-panel__edge-link"
                            >
                                <span className="act-panel__edge-dir">●</span>
                                <span className="act-panel__edge-target">{resolveActParticipantLabel(act, key, performers)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="act-panel__list">
                        <span className="act-panel__empty">No participants bound yet</span>
                    </div>
                )}
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">
                    Relations
                    <Tip text="Relations define communication channels between participants. Agents use relation names and descriptions to decide how and when to send messages." />
                </label>
                {act.relations.length > 0 ? (
                    <div className="act-panel__list">
                        {act.relations.map((rel) => (
                            <button
                                key={rel.id}
                                className="act-panel__edge-link"
                                onClick={() => openActRelationEditor(activeActId, rel.id)}
                                title="Edit relation"
                            >
                                <span className="act-panel__edge-dir">
                                    {rel.direction === 'both' ? '↔' : '→'}
                                </span>
                                <span className="act-panel__edge-target">
                                    {resolveActParticipantLabel(act, rel.between[0], performers)}
                                    {' · '}
                                    {resolveActParticipantLabel(act, rel.between[1], performers)}
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

            <div className="act-panel__section">
                <label className="act-panel__label">
                    Act Rules
                    <Tip text="Global rules injected into every participant agent's context. Use these for cross-cutting constraints like 'All code must have tests' or 'Communicate in Korean'." />
                </label>
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

            {readiness.issues.length > 0 && (
                <div className="act-panel__section">
                    <label className="act-panel__label">
                        {readiness.runnable
                            ? <><CheckCircle2 size={11} /> Readiness</>
                            : <><AlertTriangle size={11} /> Readiness</>}
                    </label>
                    <div className="act-panel__validation">
                        {readiness.issues.map((issue, index) => (
                            <div
                                key={index}
                                className={`act-panel__validation-item act-panel__validation-item--${issue.severity}`}
                                onClick={() => {
                                    if (issue.focus?.mode === 'relation' && issue.focus.relationId) {
                                        openActRelationEditor(activeActId, issue.focus.relationId)
                                    }
                                }}
                                style={{ cursor: issue.focus ? 'pointer' : undefined }}
                            >
                                {issue.severity === 'error'
                                    ? <AlertCircle size={10} style={{ flexShrink: 0 }} />
                                    : <span className="act-panel__validation-dot" />}
                                {issue.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ActSafetyEditor actId={activeActId} />

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
