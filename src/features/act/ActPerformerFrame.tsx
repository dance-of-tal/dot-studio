/**
 * ActPerformerFrame — Canvas node for a performer binding in Act edit focus mode.
 *
 * Choreography model: shows performer key, ref source, subscriptions summary,
 * and active dance count. Clicking selects the performer for inspector editing.
 */
import { useMemo, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Trash2, Hexagon, Mail, BookOpen } from 'lucide-react'

import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'

import './ActPerformerFrame.css'

export const ACT_PERFORMER_WIDTH = 340
export const ACT_PERFORMER_HEIGHT = 200

export default function ActPerformerFrame({ id }: any) {
    const {
        acts,
        editingActId,
        selectedActPerformerKey,
        unbindPerformerFromAct,
        selectActPerformer,
    } = useStudioStore()

    const performerKey = id.replace(/^act-p-/, '')
    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    const binding = act ? act.performers[performerKey] : null

    const isSelected = selectedActPerformerKey === performerKey

    const handleRemove = useCallback(() => {
        if (!editingActId) return
        unbindPerformerFromAct(editingActId, performerKey)
    }, [editingActId, performerKey, unbindPerformerFromAct])

    const handleSelect = useCallback(() => {
        selectActPerformer(performerKey)
    }, [performerKey, selectActPerformer])

    if (!act || !binding || !editingActId) return null

    // Display performer ref info
    const refLabel = binding.performerRef.kind === 'registry'
        ? binding.performerRef.urn.split('/').pop() || binding.performerRef.urn
        : `Draft: ${binding.performerRef.draftId}`

    // Subscriptions summary
    const subs = binding.subscriptions || {}
    const subCount = (subs.messagesFrom?.length || 0) + (subs.messageTags?.length || 0) + (subs.boardKeys?.length || 0)

    return (
        <div className="act-performer-node" onClick={handleSelect}>
            <Handle type="target" position={Position.Left} className="act-performer-node__handle" />
            <Handle type="source" position={Position.Right} className="act-performer-node__handle" />
            <CanvasWindowFrame
                className="act-performer-node__frame nowheel"
                width={ACT_PERFORMER_WIDTH}
                height={ACT_PERFORMER_HEIGHT}
                selected={isSelected}
                minWidth={300}
                minHeight={120}
                headerStart={<span className="canvas-frame__name">{performerKey}</span>}
                headerEnd={(
                    <div className="canvas-frame__header-actions">
                        <button
                            className="icon-btn"
                            title="Remove from Act"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleRemove()
                            }}
                            style={{ padding: '0 4px', opacity: 0.7 }}
                        >
                            <Trash2 size={11} />
                        </button>
                    </div>
                )}
                bodyClassName="nowheel nodrag"
            >
                <div className="act-performer-body">
                    <div className="act-performer-body__ref">
                        <Hexagon size={13} />
                        <span>{refLabel}</span>
                    </div>
                    {binding.activeDanceIds && binding.activeDanceIds.length > 0 && (
                        <div className="act-performer-body__dances">
                            <BookOpen size={11} />
                            <span>{binding.activeDanceIds.length} dance{binding.activeDanceIds.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                    {subCount > 0 && (
                        <div className="act-performer-body__subs">
                            <Mail size={11} />
                            <span>{subCount} subscription{subCount !== 1 ? 's' : ''}</span>
                            <span className="act-performer-body__sub-detail">
                                {subs.messagesFrom && subs.messagesFrom.length > 0 && `from: ${subs.messagesFrom.join(', ')}`}
                            </span>
                        </div>
                    )}
                    {subCount === 0 && (
                        <div className="act-performer-body__hint">
                            No subscriptions — click to configure
                        </div>
                    )}
                </div>
            </CanvasWindowFrame>
        </div>
    )
}
