import { useEffect, useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
    AlertTriangle, AlertCircle, CheckCircle2, User, ArrowRightLeft, Shield, Trash2,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import { resolveActParticipantLabel } from './participant-labels'
import { evaluateActReadiness } from './act-readiness'
import ActSafetyEditor from './ActSafetyEditor'
import Tip from './Tip'
import type { ActEditorTab } from '../../store/types'

export default function ActMetaView() {
    const {
        acts, performers,
        actEditorState,
        renameAct,
        updateActAuthoringMeta,
        updateActDescription,
        openActParticipantEditor,
        openActRelationEditor,
        unbindPerformerFromAct,
        removeRelation,
        updateActRules,
    } = useStudioStore(useShallow((state) => ({
        acts: state.acts,
        performers: state.performers,
        actEditorState: state.actEditorState,
        renameAct: state.renameAct,
        updateActAuthoringMeta: state.updateActAuthoringMeta,
        updateActDescription: state.updateActDescription,
        openActParticipantEditor: state.openActParticipantEditor,
        openActRelationEditor: state.openActRelationEditor,
        unbindPerformerFromAct: state.unbindPerformerFromAct,
        removeRelation: state.removeRelation,
        updateActRules: state.updateActRules,
    })))
    const activeActId = actEditorState?.actId || null
    const act = acts.find((a) => a.id === activeActId)

    const meta = act?.meta?.authoring || {}
    const [activeTab, setActiveTab] = useState<ActEditorTab>(actEditorState?.tab || 'overview')
    const [ruleInput, setRuleInput] = useState('')

    useEffect(() => {
        setActiveTab(actEditorState?.tab || 'overview')
    }, [actEditorState?.actId, actEditorState?.tab])

    const participantKeys = act ? Object.keys(act.participants) : []

    const commitName = (value: string) => {
        if (!act || !activeActId) return
        const nextName = value.trim()
        if (nextName && nextName !== act.name) {
            renameAct(activeActId, nextName)
        }
    }

    const commitDesc = (value: string) => {
        if (!act || !activeActId) return
        updateActDescription(activeActId, value)
        updateActAuthoringMeta(activeActId, {
            ...act.meta,
            authoring: { ...meta, description: value },
        })
    }

    const readiness = useMemo(
        () => (act ? evaluateActReadiness(act, performers) : { runnable: false, issues: [] }),
        [act, performers],
    )

    if (!act || !activeActId) return null

    const tabs: Array<{ key: ActEditorTab; label: string; count?: number; icon: ReactNode }> = [
        { key: 'overview', label: 'Overview', icon: <CheckCircle2 size={12} /> },
        { key: 'participants', label: 'Participants', count: participantKeys.length, icon: <User size={12} /> },
        { key: 'relations', label: 'Relations', count: act.relations.length, icon: <ArrowRightLeft size={12} /> },
        { key: 'rules', label: 'Rules', count: (act.actRules || []).length, icon: <Shield size={12} /> },
    ]
    const readinessLabel = readiness.runnable
        ? readiness.issues.length > 0
            ? 'Warnings'
            : 'Ready'
        : 'Blocked'
    const readinessHint = readiness.runnable
        ? readiness.issues.length > 0
            ? `${readiness.issues.length} open issue${readiness.issues.length === 1 ? '' : 's'}`
            : 'Runnable now'
        : `${readiness.issues.length} issue${readiness.issues.length === 1 ? '' : 's'} to fix`

    return (
        <div className="act-panel__content edit-workbench act-edit-workbench">
            <div className="act-edit-workbench__tabs" role="tablist" aria-label="Act edit sections">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.key}
                        className={`act-edit-workbench__tab ${activeTab === tab.key ? 'act-edit-workbench__tab--active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                        {typeof tab.count === 'number' ? (
                            <span className="act-edit-workbench__tab-count">{tab.count}</span>
                        ) : null}
                    </button>
                ))}
            </div>

            <div className="edit-advanced act-edit-workbench__body">
                {activeTab === 'overview' && (
                    <>
                        <div className="adv-section">
                            <div className="adv-section__head">
                                <span className="section-title">Overview</span>
                            </div>
                            <div className="adv-section__body">
                                <label className="adv-field">
                                    <span className="adv-field__label">
                                        Name
                                        <Tip text="The Act name is visible to all participant agents. Use a clear, descriptive name so agents can understand the workflow context." />
                                    </span>
                                    <input
                                        key={`act-name:${activeActId}:${act.name}`}
                                        className="text-input"
                                        defaultValue={act.name}
                                        onBlur={(e) => commitName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitName(e.currentTarget.value)
                                            }
                                        }}
                                    />
                                </label>
                                <label className="adv-field">
                                    <span className="adv-field__label">
                                        Description
                                        <Tip text="This description is injected into each participant agent's context. Write a clear purpose statement so agents understand what this workflow does and how they should collaborate." />
                                    </span>
                                    <textarea
                                        key={`act-desc:${activeActId}:${act.description || meta.description || ''}`}
                                        className="text-input act-edit-workbench__textarea"
                                        defaultValue={act.description || meta.description || ''}
                                        onBlur={(e) => commitDesc(e.target.value)}
                                        placeholder="Describe the workflow this Act performs"
                                        rows={4}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="act-edit-workbench__stats">
                            <div className="act-edit-workbench__stat-card">
                                <span className="act-edit-workbench__stat-icon">
                                    <User size={12} />
                                </span>
                                <span className="act-edit-workbench__stat-copy">
                                    <strong>{participantKeys.length}</strong>
                                    <span>Participants</span>
                                </span>
                            </div>
                            <div className="act-edit-workbench__stat-card">
                                <span className="act-edit-workbench__stat-icon">
                                    <ArrowRightLeft size={12} />
                                </span>
                                <span className="act-edit-workbench__stat-copy">
                                    <strong>{act.relations.length}</strong>
                                    <span>Relations</span>
                                </span>
                            </div>
                            <div className={`act-edit-workbench__stat-card ${readiness.runnable ? 'is-positive' : 'is-warning'}`}>
                                <span className="act-edit-workbench__stat-icon">
                                    {readiness.runnable ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                </span>
                                <span className="act-edit-workbench__stat-copy">
                                    <strong>{readinessLabel}</strong>
                                    <span>{readinessHint}</span>
                                </span>
                            </div>
                        </div>

                        {readiness.issues.length > 0 && (
                            <div className="adv-section">
                                <div className="adv-section__head">
                                    <span className="section-title">Readiness</span>
                                </div>
                                <div className="adv-section__body">
                                    <div className="act-panel__validation">
                                        {readiness.issues.map((issue, index) => (
                                            <div
                                                key={index}
                                                className={`act-panel__validation-item act-panel__validation-item--${issue.severity}`}
                                                onClick={() => {
                                                    if (issue.focus?.mode === 'relation' && issue.focus.relationId) {
                                                        openActRelationEditor(activeActId, issue.focus.relationId)
                                                    }
                                                    if (issue.focus?.mode === 'participant' && issue.focus.participantKey) {
                                                        openActParticipantEditor(activeActId, issue.focus.participantKey)
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
                            </div>
                        )}

                        {meta.tags && meta.tags.length > 0 && (
                            <div className="adv-section">
                                <div className="adv-section__head">
                                    <span className="section-title">Tags</span>
                                </div>
                                <div className="adv-section__body">
                                    <div className="act-panel__tags">
                                        {meta.tags.map((tag, index) => (
                                            <span key={index} className="act-panel__tag">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'participants' && (
                    <div className="adv-section">
                        <div className="adv-section__head">
                            <span className="section-title">Participants</span>
                            <span className="adv-section__hint">Click a participant to edit bindings and subscriptions.</span>
                        </div>
                        <div className="adv-section__body">
                            {participantKeys.length > 0 ? (
                                <div className="adv-list">
                                    {participantKeys.map((key) => {
                                        const relationCount = act.relations.filter((relation) => relation.between.includes(key)).length
                                        return (
                                            <div key={key} className="act-edit-workbench__list-row">
                                                <button
                                                    type="button"
                                                    className="adv-list__item act-edit-workbench__list-button"
                                                    onClick={() => openActParticipantEditor(activeActId, key)}
                                                >
                                                    <User size={12} className="adv-list__icon" />
                                                    <span className="act-edit-workbench__list-body">
                                                        <strong>{resolveActParticipantLabel(act, key, performers)}</strong>
                                                        <span>{relationCount} relation{relationCount === 1 ? '' : 's'}</span>
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="act-edit-workbench__inline-action act-edit-workbench__inline-action--danger"
                                                    title="Remove participant"
                                                    aria-label={`Remove ${resolveActParticipantLabel(act, key, performers)}`}
                                                    onClick={() => unbindPerformerFromAct(activeActId, key)}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="act-edit-workbench__empty-card">No participants bound yet.</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'relations' && (
                    <div className="adv-section">
                        <div className="adv-section__head">
                            <span className="section-title">Relations</span>
                            <span className="adv-section__hint">Open a relation to tune naming, direction, and description.</span>
                        </div>
                        <div className="adv-section__body">
                            {act.relations.length > 0 ? (
                                <div className="adv-list">
                                    {act.relations.map((rel) => (
                                        <div key={rel.id} className="act-edit-workbench__list-row">
                                            <button
                                                type="button"
                                                className="adv-list__item act-edit-workbench__list-button"
                                                onClick={() => openActRelationEditor(activeActId, rel.id)}
                                                title="Edit relation"
                                            >
                                                <ArrowRightLeft size={12} className="adv-list__icon" />
                                                <span className="act-edit-workbench__list-body">
                                                    <strong>
                                                        {resolveActParticipantLabel(act, rel.between[0], performers)}
                                                        <span className="act-panel__edge-inline-arrow">
                                                            {rel.direction === 'both' ? '↔' : '→'}
                                                        </span>
                                                        {resolveActParticipantLabel(act, rel.between[1], performers)}
                                                    </strong>
                                                    <span>{rel.name || 'Unnamed relation'}</span>
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                className="act-edit-workbench__inline-action act-edit-workbench__inline-action--danger"
                                                title="Delete relation"
                                                aria-label={`Delete relation ${rel.name || rel.id}`}
                                                onClick={() => removeRelation(activeActId, rel.id)}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="act-edit-workbench__empty-card">No relations yet.</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'rules' && (
                    <>
                        <div className="adv-section">
                            <div className="adv-section__head">
                                <span className="section-title">Act Rules</span>
                            </div>
                            <div className="adv-section__body">
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
                                <input
                                    className="text-input"
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

                        <ActSafetyEditor actId={activeActId} />
                    </>
                )}
            </div>
        </div>
    )
}
