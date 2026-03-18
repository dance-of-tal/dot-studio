/**
 * ActParticipantFrame — Canvas node for a participant binding in Act layout mode.
 *
 * Choreography model: shows participant binding, ref source, subscriptions summary,
 * and active dance count. Clicking selects the participant for inspector editing.
 */
import { useMemo, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Trash2, Hexagon, Mail, BookOpen } from 'lucide-react'

import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import { resolveActParticipantLabel } from './participant-labels'

import './ActParticipantFrame.css'

export const ACT_PARTICIPANT_WIDTH = 340
export const ACT_PARTICIPANT_HEIGHT = 200

export default function ActParticipantFrame({ id }: any) {
    const {
        acts,
        layoutActId,
        selectedActParticipantKey,
        unbindPerformerFromAct,
        selectActParticipant,
    } = useStudioStore()

    const participantKey = id.replace(/^act-p-/, '')
    const act = useMemo(() => acts.find((a) => a.id === layoutActId), [acts, layoutActId])
    const binding = act ? act.performers[participantKey] : null

    const isSelected = selectedActParticipantKey === participantKey

    const handleRemove = useCallback(() => {
        if (!layoutActId) return
        unbindPerformerFromAct(layoutActId, participantKey)
    }, [layoutActId, participantKey, unbindPerformerFromAct])

    const handleSelect = useCallback(() => {
        selectActParticipant(participantKey)
    }, [participantKey, selectActParticipant])

    if (!act || !binding || !layoutActId) return null

    const participantLabel = resolveActParticipantLabel(act, participantKey, useStudioStore.getState().performers)

    // Display participant ref info
    const refLabel = binding.performerRef.kind === 'registry'
        ? binding.performerRef.urn.split('/').pop() || binding.performerRef.urn
        : `Draft: ${binding.performerRef.draftId}`

    // Subscriptions summary
    const subs = binding.subscriptions || {}
    const callboardKeys = subs.callboardKeys || subs.boardKeys || []
    const subCount = (subs.messagesFrom?.length || 0) + (subs.messageTags?.length || 0) + callboardKeys.length

    return (
        <div className="act-participant-node" onClick={handleSelect}>
            <Handle type="target" position={Position.Left} className="act-participant-node__handle" />
            <Handle type="source" position={Position.Right} className="act-participant-node__handle" />
            <CanvasWindowFrame
                className="act-participant-node__frame nowheel"
                width={ACT_PARTICIPANT_WIDTH}
                height={ACT_PARTICIPANT_HEIGHT}
                selected={isSelected}
                minWidth={300}
                minHeight={120}
                headerStart={<span className="canvas-frame__name">{participantLabel}</span>}
                headerEnd={(
                    <div className="canvas-frame__header-actions">
                        <button
                            className="icon-btn act-participant-node__remove-btn"
                            title="Remove from Act"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleRemove()
                            }}
                        >
                            <Trash2 size={11} />
                        </button>
                    </div>
                )}
                bodyClassName="nowheel nodrag"
            >
                <div className="act-participant-body">
                    <div className="act-participant-body__ref">
                        <Hexagon size={13} />
                        <span>{refLabel}</span>
                    </div>
                    {binding.activeDanceIds && binding.activeDanceIds.length > 0 && (
                        <div className="act-participant-body__dances">
                            <BookOpen size={11} />
                            <span>{binding.activeDanceIds.length} dance{binding.activeDanceIds.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                    {subCount > 0 ? (
                        <div className="act-participant-body__subs">
                            <Mail size={11} />
                            <span className="act-participant-body__sub-title">{subCount} subscription{subCount !== 1 ? 's' : ''}</span>
                            <div className="act-participant-body__sub-tags">
                                {(subs.messagesFrom || []).map((v) => (
                                    <span key={`from-${v}`} className="act-participant-body__tag act-participant-body__tag--from">from: {v}</span>
                                ))}
                                {(subs.messageTags || []).map((v) => (
                                    <span key={`tag-${v}`} className="act-participant-body__tag act-participant-body__tag--tag">#{v}</span>
                                ))}
                                {callboardKeys.map((v) => (
                                    <span key={`board-${v}`} className="act-participant-body__tag act-participant-body__tag--board">callboard: {v}</span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="act-participant-body__hint">
                            <Mail size={11} />
                            <span>No subscriptions — click to configure this participant</span>
                        </div>
                    )}
                </div>
            </CanvasWindowFrame>
        </div>
    )
}
