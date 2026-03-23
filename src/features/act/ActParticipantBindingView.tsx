import { useMemo, useState } from 'react'
import { User, ArrowRightLeft, Hexagon, Trash2 } from 'lucide-react'
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
    } = useStudioStore()

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
        <div className="act-panel__content">
            <div className="act-panel__item-header">
                <User size={14} className="act-panel__item-icon" />
                <span className="act-panel__item-name act-panel__item-name--edge">
                    {resolveActParticipantLabel(act, participantKey, performers)}
                </span>
                <button
                    className="icon-btn act-panel__danger-btn"
                    title="Remove participant"
                    onClick={() => {
                        unbindPerformerFromAct(activeActId, participantKey)
                        openActEditor(activeActId, 'act')
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
                </div>
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label"><ArrowRightLeft size={11} /> Relations ({relatedRelations.length})</label>
                {relatedRelations.length > 0 ? (
                    <div className="act-panel__list">
                        {relatedRelations.map((relation) => {
                            const otherKey = relation.between[0] === participantKey ? relation.between[1] : relation.between[0]
                            return (
                                <div
                                    key={relation.id}
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
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <span className="act-panel__empty">No relations defined</span>
                )}
            </div>

            <div className="act-panel__section">
                <label className="act-panel__label">Subscriptions</label>

                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Messages From</span>
                    <div className="act-panel__tags">
                        {(subscriptions.messagesFrom || []).map((value) => (
                            <span key={value} className="act-panel__tag" onClick={() => removeSubItem('messagesFrom', value)}>
                                {value} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={subInput.messagesFrom}
                            onChange={(e) => setSubInput((prev) => ({ ...prev, messagesFrom: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSubItem('messagesFrom')}
                            placeholder="participant key"
                        />
                    </div>
                </div>

                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Message Tags</span>
                    <div className="act-panel__tags">
                        {(subscriptions.messageTags || []).map((value) => (
                            <span key={value} className="act-panel__tag" onClick={() => removeSubItem('messageTags', value)}>
                                {value} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={subInput.messageTags}
                            onChange={(e) => setSubInput((prev) => ({ ...prev, messageTags: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSubItem('messageTags')}
                            placeholder="tag name"
                        />
                    </div>
                </div>

                <div className="act-panel__sub-field">
                    <span className="act-panel__sub-label">Callboard Keys</span>
                    <div className="act-panel__tags">
                        {getCallboardKeys(subscriptions).map((value: string) => (
                            <span key={value} className="act-panel__tag" onClick={() => removeSubItem('callboardKeys', value)}>
                                {value} ×
                            </span>
                        ))}
                    </div>
                    <div className="act-panel__sub-input-row">
                        <input
                            className="act-panel__input act-panel__input--small"
                            value={subInput.callboardKeys}
                            onChange={(e) => setSubInput((prev) => ({ ...prev, callboardKeys: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSubItem('callboardKeys')}
                            placeholder="key pattern (e.g. launch-brief, signal-*)"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
