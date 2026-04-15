import { useMemo, useState } from 'react'
import { User, ArrowRightLeft, ChevronLeft, Hexagon, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ParticipantSubscriptions } from '../../types'
import { useStudioStore } from '../../store'
import { assetUrnDisplayName } from '../../lib/asset-urn'
import { resolveActParticipantLabel } from './participant-labels'
import { getCallboardKeys, nextSubscriptions } from './act-inspector-helpers'

type SubscriptionField = keyof Pick<ParticipantSubscriptions, 'messagesFrom' | 'messageTags' | 'callboardKeys'>
type DirectSubscriptionField = Exclude<SubscriptionField, 'callboardKeys'>

export default function ActParticipantBindingView() {
    const {
        acts, performers, actEditorState,
        openActEditor, openActRelationEditor, updatePerformerBinding, unbindPerformerFromAct,
    } = useStudioStore(useShallow((state) => ({
        acts: state.acts,
        performers: state.performers,
        actEditorState: state.actEditorState,
        openActEditor: state.openActEditor,
        openActRelationEditor: state.openActRelationEditor,
        updatePerformerBinding: state.updatePerformerBinding,
        unbindPerformerFromAct: state.unbindPerformerFromAct,
    })))

    const activeActId = actEditorState?.actId || null
    const participantKey = actEditorState?.mode === 'participant' ? actEditorState.participantKey : null
    const act = useMemo(() => acts.find((a) => a.id === activeActId), [acts, activeActId])
    const binding = act && participantKey ? act.participants[participantKey] : null

    const relatedRelations = useMemo(() => {
        if (!act || !participantKey) return []
        return act.relations.filter(
            (relation) => relation.between.includes(participantKey),
        )
    }, [act, participantKey])

    const [subInput, setSubInput] = useState({ messagesFrom: '', messageTags: '', callboardKeys: '' })

    if (!act || !binding || !participantKey || !activeActId) return null

    const refLabel = binding.performerRef.kind === 'registry'
        ? assetUrnDisplayName(binding.performerRef.urn)
        : `Draft: ${binding.performerRef.draftId}`

    const subscriptions = binding.subscriptions || {}
    const messageTags = subscriptions.messageTags || []
    const callboardKeys = getCallboardKeys(subscriptions)
    const availableMessageSources = Object.keys(act.participants)
        .filter((key) => key !== participantKey)
        .map((key) => ({ key, label: resolveActParticipantLabel(act, key, performers) }))

    const getSubscriptionValues = (field: DirectSubscriptionField) => subscriptions[field] || []

    const addSubItem = (field: SubscriptionField) => {
        const value = subInput[field].trim()
        if (!value) return
        const current = field === 'callboardKeys'
            ? getCallboardKeys(subscriptions)
            : getSubscriptionValues(field)
        if (current.includes(value)) return
        updatePerformerBinding(activeActId, participantKey, {
            subscriptions: nextSubscriptions(subscriptions, { [field]: [...current, value] }),
        })
        setSubInput((prev) => ({ ...prev, [field]: '' }))
    }

    const removeSubItem = (field: SubscriptionField, value: string) => {
        const current = field === 'callboardKeys'
            ? getCallboardKeys(subscriptions)
            : getSubscriptionValues(field)
        updatePerformerBinding(activeActId, participantKey, {
            subscriptions: nextSubscriptions(subscriptions, { [field]: current.filter((entry: string) => entry !== value) }),
        })
    }

    return (
        <div className="act-panel__content act-panel__content--detail">
            <div className="act-panel__item-header">
                <button
                    type="button"
                    className="icon-btn"
                    title="Back to Act Config"
                    onClick={() => openActEditor(activeActId, 'act', { tab: 'participants' })}
                >
                    <ChevronLeft size={12} />
                </button>
                <User size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {resolveActParticipantLabel(act, participantKey, performers)}
                </span>
                <button
                    type="button"
                    className="icon-btn act-panel__danger-btn"
                    title="Remove participant"
                    onClick={() => {
                        unbindPerformerFromAct(activeActId, participantKey)
                        openActEditor(activeActId, 'act', { tab: 'participants' })
                    }}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <div className="act-panel__detail-stack">
                <div className="act-panel__section act-panel__section--card">
                    <label className="act-panel__label"><Hexagon size={11} /> Binding</label>
                    <div className="act-panel__stat-grid">
                        <div className="act-panel__stat act-panel__stat--wide">
                            <Hexagon size={11} />
                            <span>{refLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="act-panel__section act-panel__section--card">
                    <label className="act-panel__label"><ArrowRightLeft size={11} /> Relations ({relatedRelations.length})</label>
                    {relatedRelations.length > 0 ? (
                        <div className="act-panel__list">
                            {relatedRelations.map((relation) => {
                                const otherKey = relation.between[0] === participantKey ? relation.between[1] : relation.between[0]
                                return (
                                    <button
                                        key={relation.id}
                                        type="button"
                                        className="act-panel__edge-link"
                                        onClick={() => openActRelationEditor(activeActId, relation.id)}
                                        title="Click to edit relation"
                                    >
                                        <span className="act-panel__edge-dir">
                                            {relation.direction === 'both' ? '↔' : '→'}
                                        </span>
                                        <span className="act-panel__edge-target">{resolveActParticipantLabel(act, otherKey, performers)}</span>
                                        <span className="act-panel__edge-badge">
                                            {relation.direction}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    ) : (
                        <span className="act-panel__empty">No relations defined</span>
                    )}
                </div>

                <div className="act-panel__section act-panel__section--card">
                    <label className="act-panel__label">Subscriptions</label>
                    <span className="act-panel__hint">Click any chip to remove it.</span>

                    <div className="act-panel__sub-field">
                        <div className="act-panel__sub-heading">
                            <span className="act-panel__sub-label">Messages From</span>
                            <span className="act-panel__sub-meta">Only wake for specific teammates.</span>
                        </div>
                        {(subscriptions.messagesFrom || []).length > 0 ? (
                            <div className="act-panel__tags">
                                {(subscriptions.messagesFrom || []).map((value) => (
                                    <span key={value} className="act-panel__tag" onClick={() => removeSubItem('messagesFrom', value)}>
                                        {resolveActParticipantLabel(act, value, performers)} ×
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="act-panel__empty act-panel__empty--inline">No teammate filters yet.</span>
                        )}
                        <div className="act-panel__sub-input-row">
                            <select
                                className="act-panel__input act-panel__input--small"
                                value={subInput.messagesFrom}
                                onChange={(e) => setSubInput((prev) => ({ ...prev, messagesFrom: e.target.value }))}
                            >
                                <option value="">Select teammate…</option>
                                {availableMessageSources.map((option) => (
                                    <option key={option.key} value={option.key}>{option.label}</option>
                                ))}
                            </select>
                            <button
                                className="act-panel__action-btn"
                                type="button"
                                disabled={!subInput.messagesFrom}
                                onClick={() => addSubItem('messagesFrom')}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="act-panel__sub-field">
                        <div className="act-panel__sub-heading">
                            <span className="act-panel__sub-label">Message Tags</span>
                            <span className="act-panel__sub-meta">Match tagged messages only.</span>
                        </div>
                        {messageTags.length > 0 ? (
                            <div className="act-panel__tags">
                                {messageTags.map((value) => (
                                    <span key={value} className="act-panel__tag" onClick={() => removeSubItem('messageTags', value)}>
                                        {value} ×
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="act-panel__empty act-panel__empty--inline">No message tags yet.</span>
                        )}
                        <div className="act-panel__sub-input-row">
                            <input
                                className="act-panel__input act-panel__input--small"
                                value={subInput.messageTags}
                                onChange={(e) => setSubInput((prev) => ({ ...prev, messageTags: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && addSubItem('messageTags')}
                                placeholder="tag name"
                            />
                            <button
                                className="act-panel__action-btn"
                                type="button"
                                disabled={!subInput.messageTags.trim()}
                                onClick={() => addSubItem('messageTags')}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="act-panel__sub-field">
                        <div className="act-panel__sub-heading">
                            <span className="act-panel__sub-label">Shared Note Keys</span>
                            <span className="act-panel__sub-meta">Listen to shared board updates.</span>
                        </div>
                        {callboardKeys.length > 0 ? (
                            <div className="act-panel__tags">
                                {callboardKeys.map((value: string) => (
                                    <span key={value} className="act-panel__tag" onClick={() => removeSubItem('callboardKeys', value)}>
                                        {value} ×
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="act-panel__empty act-panel__empty--inline">No shared note keys yet.</span>
                        )}
                        <div className="act-panel__sub-input-row">
                            <input
                                className="act-panel__input act-panel__input--small"
                                value={subInput.callboardKeys}
                                onChange={(e) => setSubInput((prev) => ({ ...prev, callboardKeys: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && addSubItem('callboardKeys')}
                                placeholder="key pattern (e.g. launch-brief, signal-*)"
                            />
                            <button
                                className="act-panel__action-btn"
                                type="button"
                                disabled={!subInput.callboardKeys.trim()}
                                onClick={() => addSubItem('callboardKeys')}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="act-panel__sub-field">
                        <span className="act-panel__sub-label">Event Types</span>
                        <label className="act-panel__checkbox-card">
                            <input
                                type="checkbox"
                                checked={(subscriptions.eventTypes || []).includes('runtime.idle')}
                                onChange={(e) => {
                                    const nextEt: ('runtime.idle')[] = e.target.checked ? ['runtime.idle'] : []
                                    updatePerformerBinding(activeActId, participantKey, {
                                        subscriptions: nextSubscriptions(subscriptions, { eventTypes: nextEt }),
                                    })
                                }}
                            />
                            <span className="act-panel__checkbox-copy">
                                <span className="act-panel__checkbox-title">runtime.idle</span>
                                <span className="act-panel__checkbox-description">Wake when other participants go idle.</span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    )
}
