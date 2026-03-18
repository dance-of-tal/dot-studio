/**
 * ActFrame — Canvas node representing an Act.
 *
 * Always renders ActChatPanel (chat mode).
 * Layout button enters Act layout mode (separate canvas view with ActPerformerFrame nodes).
 */
import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Handle, Position } from '@xyflow/react'
import { Workflow, Pencil, EyeOff, Activity, Plus } from 'lucide-react'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import ActChatPanel from './ActChatPanel'
import ActActivityView from './ActActivityView'
import { resolveActParticipantLabel } from './participant-labels'
import './ActFrame.css'

export default function ActFrame({ data, id }: any) {
    const {
        acts,
        performers,
        selectedActId,
        selectAct,
        selectActParticipant,
        selectRelation,
        enterActLayoutMode,
        toggleActVisibility,
        updateActSize,
        activeThreadId,
        actThreads,
        setAssetLibraryOpen,
        createThread,
        autoLayoutActParticipants,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === id), [acts, id])
    const [showActivity, setShowActivity] = useState(false)
    const { setNodeRef: setActDropRef, isOver: isActDropOver } = useDroppable({
        id: `act-root-${id}`,
        data: { type: 'act-root', actId: id },
    })
    if (!act) return null

    const isSelected = selectedActId === id
    const width = data.width || act.width || 340
    const expandedHeight = Math.max(250, act.height || 420)
    const collapsedHeight = 116
    const height = isSelected ? expandedHeight : collapsedHeight
    const participantKeys = Object.keys(act.performers)
    const participantItems = participantKeys.map((key) => ({
        key,
        label: resolveActParticipantLabel(act, key, performers),
    }))
    const relationItems = act.relations.slice(0, 3).map((relation) => ({
        id: relation.id,
        label: `${resolveActParticipantLabel(act, relation.between[0], performers)} ↔ ${resolveActParticipantLabel(act, relation.between[1], performers)}`,
    }))
    const threadCount = (actThreads[id] || []).length

    const handleResizeEnd = () => {
        if (!isSelected) return
        const node = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
        if (node) {
            const rect = node.getBoundingClientRect()
            updateActSize(id, Math.round(rect.width), Math.round(rect.height))
        }
    }

    return (
        <div
            ref={setActDropRef}
            className={`act-frame-shell ${isActDropOver ? 'act-frame-shell--drop-over' : ''}`}
        >
            <Handle type="target" position={Position.Left} className="act-frame__handle" />
            <Handle type="source" position={Position.Right} className="act-frame__handle" />
            <CanvasWindowFrame
                className={`act-frame nowheel ${isSelected ? 'act-frame--selected' : ''} act-frame--chat`}
                width={width}
                height={height}
                resizable={isSelected}
                minWidth={340}
                minHeight={isSelected ? 250 : collapsedHeight}
                transformActive={data.transformActive || false}
                onActivateTransform={data.onActivateTransform}
                onDeactivateTransform={data.onDeactivateTransform}
                onResizeEnd={handleResizeEnd}
                selected={isSelected}
                headerStart={
                    <div className="act-frame__title" onClick={() => selectAct(id)}>
                        <Workflow size={12} className="act-frame__icon" />
                        <span className="act-frame__name">{act.name}</span>
                        {(() => {
                            const threads = actThreads[id] || []
                            const currentIdx = threads.findIndex((t) => t.id === activeThreadId)
                            if (threads.length > 0 && currentIdx >= 0) {
                                return (
                                    <span className="act-frame__thread-chip">
                                        #{currentIdx + 1}
                                    </span>
                                )
                            }
                            return null
                        })()}
                    </div>
                }
                headerEnd={
                    <div className="act-frame__header-actions">
                    <button
                        className="icon-btn act-frame__edit-btn"
                        title="Add Participant"
                        onClick={() => {
                            useStudioStore.getState().selectAct(id)
                            setAssetLibraryOpen(true)
                        }}
                    >
                        <Plus size={11} />
                    </button>
                    <button
                        className={`icon-btn act-frame__activity-btn ${showActivity ? 'active' : ''}`}
                        title="Activity"
                        onClick={() => setShowActivity(!showActivity)}
                    >
                        <Activity size={11} />
                        </button>
                        <button
                            className="icon-btn act-frame__edit-btn"
                            title="New Thread"
                            onClick={() => {
                                void createThread(id)
                            }}
                        >
                            <Workflow size={11} />
                        </button>
                        <button
                            className="icon-btn act-frame__edit-btn"
                            title="Advanced Layout"
                            onClick={() => enterActLayoutMode(id)}
                        >
                            <Pencil size={11} />
                        </button>
                        <button
                            className="icon-btn act-frame__close-btn"
                            title="Hide Act"
                            onClick={() => toggleActVisibility(id)}
                        >
                            <EyeOff size={11} />
                        </button>
                    </div>
                }
            >
                {!isSelected ? (
                    <div className="act-frame__summary">
                        <div className="act-frame__summary-stats">
                            <span className="act-frame__summary-chip">{participantKeys.length} participants</span>
                            <span className="act-frame__summary-chip">{act.relations.length} relations</span>
                            <span className="act-frame__summary-chip">{threadCount} threads</span>
                        </div>
                        {participantItems.length > 0 ? (
                            <div className="act-frame__summary-participants">
                                {participantItems.slice(0, 4).map((participant) => (
                                    <button
                                        key={participant.key}
                                        className="act-frame__summary-participant"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            selectAct(id)
                                            selectActParticipant(participant.key)
                                        }}
                                    >
                                        {participant.label}
                                    </button>
                                ))}
                                {participantItems.length > 4 ? (
                                    <span className="act-frame__summary-participant">+{participantItems.length - 4}</span>
                                ) : null}
                            </div>
                        ) : (
                            <div className="act-frame__summary-empty">Connect or add performers to define this act.</div>
                        )}
                        {relationItems.length > 0 ? (
                            <div className="act-frame__summary-relations">
                                {relationItems.map((relation) => (
                                    <button
                                        key={relation.id}
                                        className="act-frame__summary-relation"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            selectAct(id)
                                            selectRelation(relation.id)
                                        }}
                                    >
                                        {relation.label}
                                    </button>
                                ))}
                                {act.relations.length > relationItems.length ? (
                                    <span className="act-frame__summary-relation">+{act.relations.length - relationItems.length} relations</span>
                                ) : null}
                            </div>
                        ) : null}
                        <div className="act-frame__summary-actions">
                            {participantItems.length > 1 ? (
                                <button
                                    className="act-frame__summary-action"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        autoLayoutActParticipants(id)
                                    }}
                                >
                                    Auto Layout
                                </button>
                            ) : null}
                            <button
                                className="act-frame__summary-action"
                                onClick={async (event) => {
                                    event.stopPropagation()
                                    selectAct(id)
                                    const threads = actThreads[id] || []
                                    if (threads.length === 0) {
                                        await createThread(id)
                                    }
                                    setShowActivity(true)
                                }}
                            >
                                Callboard
                            </button>
                            <button
                                className="act-frame__summary-action"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    void createThread(id)
                                }}
                            >
                                New Thread
                            </button>
                            <button
                                className="act-frame__summary-action"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    selectAct(id)
                                    setAssetLibraryOpen(true)
                                }}
                            >
                                Add Participant
                            </button>
                        </div>
                    </div>
                ) : showActivity ? (
                    <ActActivityView actId={id} threadId={activeThreadId} mode="activity" />
                ) : (
                    <ActChatPanel actId={id} />
                )}
            </CanvasWindowFrame>
        </div>
    )
}
