/**
 * ActPerformerFrame — Canvas node for an Act performer binding in Act edit focus mode.
 *
 * Choreography model: shows performer ref binding info.
 * NOTE: Minimal stub for Phase 0 (type migration). Will be fully rebuilt in Phase 4.
 */
import { useMemo, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Trash2, Hexagon } from 'lucide-react'

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
    } = useStudioStore()

    const performerKey = id.replace(/^act-p-/, '')
    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    const binding = act ? act.performers[performerKey] : null

    const isSelected = selectedActPerformerKey === performerKey

    const handleRemove = useCallback(() => {
        if (!editingActId) return
        unbindPerformerFromAct(editingActId, performerKey)
    }, [editingActId, performerKey, unbindPerformerFromAct])

    if (!act || !binding || !editingActId) return null

    // Display performer ref info
    const refLabel = binding.performerRef.kind === 'registry'
        ? binding.performerRef.urn.split('/').pop() || binding.performerRef.urn
        : `Draft: ${binding.performerRef.draftId}`

    return (
        <div className="act-performer-node">
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
                <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <Hexagon size={14} />
                        <span>{refLabel}</span>
                    </div>
                    {binding.activeDanceIds && binding.activeDanceIds.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                            Dances: {binding.activeDanceIds.length}
                        </div>
                    )}
                    {binding.subscriptions && (
                        <div style={{ marginTop: '4px', opacity: 0.7 }}>
                            Subscriptions configured
                        </div>
                    )}
                </div>
            </CanvasWindowFrame>
        </div>
    )
}
