/**
 * ActPerformerFrame — Canvas node for performers inside Act edit focus mode.
 *
 * Lightweight config card with:
 * - Name + model badge
 * - Tal/Dance badges
 * - ReactFlow Handles for edge creation (Act-internal relations)
 * - Click to select → inspector shows ActPerformerInspector
 */
import { useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { User, X, RefreshCw } from 'lucide-react'
import { useStudioStore } from '../../store'
import './ActPerformerFrame.css'

const ACT_PERFORMER_WIDTH = 240
const ACT_PERFORMER_HEIGHT = 120

export { ACT_PERFORMER_WIDTH, ACT_PERFORMER_HEIGHT }

export default function ActPerformerFrame({ id, data: _data }: any) {
    const {
        acts,
        editingActId,
        selectedActPerformerKey,
        selectActPerformer,
        removePerformerFromAct,
        syncPerformerFromCanvas,
        drafts,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === editingActId), [acts, editingActId])
    // The id for this node is `act-p-{performerKey}`, extract the key
    const performerKey = id.replace(/^act-p-/, '')
    const performer = act?.performers[performerKey]

    if (!act || !performer) return null

    const isSelected = selectedActPerformerKey === performerKey

    // Resolve labels
    const modelLabel = performer.model
        ? `${performer.model.provider}/${performer.model.modelId}`.split('/').pop()
        : null
    const talLabel = performer.talRef
        ? performer.talRef.kind === 'draft'
            ? drafts[performer.talRef.draftId]?.name || 'Draft'
            : performer.talRef.urn.split('/').pop() || performer.talRef.urn
        : null
    const danceCount = performer.danceRefs.length
    const hasSource = !!performer.sourcePerformerId

    return (
        <div
            className={`act-performer-card ${isSelected ? 'act-performer-card--selected' : ''}`}
            onClick={() => selectActPerformer(isSelected ? null : performerKey)}
            style={{ width: ACT_PERFORMER_WIDTH }}
        >
            {/* Header */}
            <div className="act-performer-card__header">
                <User size={12} className="act-performer-card__icon" />
                <span className="act-performer-card__name">{performer.name}</span>
                <div className="act-performer-card__actions" onClick={(e) => e.stopPropagation()}>
                    {hasSource && (
                        <button
                            className="icon-btn"
                            title="Sync from canvas performer"
                            onClick={() => syncPerformerFromCanvas(act.id, performerKey)}
                        >
                            <RefreshCw size={10} />
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        title="Remove from Act"
                        onClick={() => removePerformerFromAct(act.id, performerKey)}
                    >
                        <X size={10} />
                    </button>
                </div>
            </div>

            {/* Badges */}
            <div className="act-performer-card__badges">
                {modelLabel && (
                    <span className="act-performer-card__badge act-performer-card__badge--model">
                        {modelLabel}
                    </span>
                )}
                {talLabel && (
                    <span className="act-performer-card__badge act-performer-card__badge--tal">
                        {talLabel}
                    </span>
                )}
                {danceCount > 0 && (
                    <span className="act-performer-card__badge act-performer-card__badge--dance">
                        {danceCount} dance{danceCount > 1 ? 's' : ''}
                    </span>
                )}
                {performer.mcpServerNames.length > 0 && (
                    <span className="act-performer-card__badge">
                        {performer.mcpServerNames.length} MCP
                    </span>
                )}
                {!modelLabel && !talLabel && danceCount === 0 && (
                    <span className="act-performer-card__badge act-performer-card__badge--empty">
                        No config
                    </span>
                )}
            </div>

            {/* ReactFlow Handles for relation creation */}
            <Handle
                type="target"
                position={Position.Top}
                className="act-performer-card__handle"
            />
            <Handle
                type="source"
                position={Position.Bottom}
                className="act-performer-card__handle"
            />
        </div>
    )
}
