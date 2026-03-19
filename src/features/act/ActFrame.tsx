/**
 * ActFrame — shell that switches between compact act boundary and selected act surface.
 */
import { useEffect, useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Handle, Position } from '@xyflow/react'
import { Workflow } from 'lucide-react'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import ActBoundarySummary from './ActBoundarySummary'
import ActHeaderActions from './ActHeaderActions'
import ActSurfacePanel from './ActSurfacePanel'
import './ActFrame.css'

export default function ActFrame({ data, id }: any) {
    const {
        acts,
        performers,
        selectedActId,
        selectAct,
        selectActParticipant,
        selectRelation,
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
    const threadCount = (actThreads[id] || []).length

    const handleResizeEnd = () => {
        if (!isSelected) return
        const node = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
        if (node) {
            const rect = node.getBoundingClientRect()
            updateActSize(id, Math.round(rect.width), Math.round(rect.height))
        }
    }

    const handleSelectAct = () => selectAct(id)
    const handleSelectParticipant = (participantKey: string) => {
        selectAct(id)
        selectActParticipant(participantKey)
    }
    const handleSelectRelation = (relationId: string) => {
        selectAct(id)
        selectRelation(relationId)
    }
    const handleOpenCallboard = async () => {
        selectAct(id)
        const threads = actThreads[id] || []
        if (threads.length === 0) {
            await createThread(id)
        }
        setShowActivity(true)
    }
    const handleCreateThread = () => {
        void createThread(id)
    }
    const handleAddParticipant = () => {
        selectAct(id)
        setAssetLibraryOpen(true)
    }
    const handleAutoLayout = () => autoLayoutActParticipants(id)

    useEffect(() => {
        if (!isSelected && showActivity) {
            setShowActivity(false)
        }
    }, [isSelected, showActivity])

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
                transformActive={isSelected ? data.transformActive || false : false}
                onActivateTransform={data.onActivateTransform}
                onDeactivateTransform={data.onDeactivateTransform}
                onResizeEnd={handleResizeEnd}
                selected={isSelected}
                headerStart={
                    <div className="act-frame__title" onClick={handleSelectAct}>
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
                headerEnd={isSelected ? (
                    <ActHeaderActions
                        showActivity={showActivity}
                        onToggleActivity={() => setShowActivity(!showActivity)}
                        onAddParticipant={handleAddParticipant}
                        onCreateThread={handleCreateThread}
                        onHide={() => toggleActVisibility(id)}
                    />
                ) : null}
            >
                {!isSelected ? (
                    <ActBoundarySummary
                        act={act}
                        performers={performers}
                        threadCount={threadCount}
                        onSelectAct={handleSelectAct}
                        onSelectParticipant={handleSelectParticipant}
                        onSelectRelation={handleSelectRelation}
                        onOpenCallboard={handleOpenCallboard}
                        onCreateThread={handleCreateThread}
                        onAddParticipant={handleAddParticipant}
                        onAutoLayout={handleAutoLayout}
                    />
                ) : (
                    <ActSurfacePanel actId={id} activeThreadId={activeThreadId} showActivity={showActivity} />
                )}
            </CanvasWindowFrame>
        </div>
    )
}
