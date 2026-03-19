/**
 * ActFrame — shell that switches between compact act boundary and selected act surface.
 */
import { useEffect, useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Handle, Position, useStore } from '@xyflow/react'
import { Workflow } from 'lucide-react'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import {
    ACT_COLLAPSED_HEIGHT,
    ACT_DEFAULT_WIDTH,
    ACT_MIN_EXPANDED_HEIGHT,
    resolveActExpandedHeight,
} from '../../lib/act-layout'
import ActBoundarySummary from './ActBoundarySummary'
import ActHeaderActions from './ActHeaderActions'
import ActSurfacePanel from './ActSurfacePanel'
import './ActFrame.css'

export default function ActFrame({ data, id }: any) {
    const {
        acts,
        performers,
        selectedActId,
        actEditorState,
        selectAct,
        openActEditor,
        toggleActVisibility,
        updateActSize,
        activeThreadId,
        actThreads,
        setAssetLibraryOpen,
        createThread,
        autoLayoutActParticipants,
        focusedPerformerId,
        focusedNodeType,
        enterFocusMode,
        exitFocusMode,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === id), [acts, id])
    const [showActivity, setShowActivity] = useState(false)
    const { setNodeRef: setActDropRef, isOver: isActDropOver } = useDroppable({
        id: `act-root-${id}`,
        data: { type: 'act-root', actId: id },
    })

    const isSelected = selectedActId === id
    const isEditing = actEditorState?.actId === id
    const isFocused = focusedPerformerId === id && focusedNodeType === 'act'
    const rfWidth = useStore((state) => state.width)
    const rfHeight = useStore((state) => state.height)
    const width = data.width || act?.width || ACT_DEFAULT_WIDTH
    const expandedHeight = resolveActExpandedHeight(act?.height)
    const collapsedHeight = ACT_COLLAPSED_HEIGHT
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
    const handleSelectParticipant = () => selectAct(id)
    const handleSelectRelation = () => selectAct(id)
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
    const handleEditAct = () => openActEditor(id, 'act')
    const handleAutoLayout = () => autoLayoutActParticipants(id)
    const handleToggleFocus = () => {
        if (isFocused) {
            exitFocusMode()
            return
        }

        enterFocusMode(id, 'act', {
            width: rfWidth || 1200,
            height: rfHeight || 800,
        })
    }

    useEffect(() => {
        if (!isSelected && showActivity) {
            setShowActivity(false)
        }
    }, [isSelected, showActivity])

    if (!act) {
        return null
    }

    return (
        <div
            ref={setActDropRef}
            className={`act-frame-shell ${isActDropOver ? 'act-frame-shell--drop-over' : ''}`}
        >
            <Handle type="target" position={Position.Left} className="act-frame__handle" />
            <Handle type="source" position={Position.Right} className="act-frame__handle" />
            <CanvasWindowFrame
                className={`act-frame nowheel ${isSelected ? 'act-frame--selected' : ''} ${isEditing ? 'act-frame--editing' : ''} ${isFocused ? 'canvas-frame--focused' : ''} act-frame--chat`}
                width={width}
                height={height}
                resizable={isSelected}
                minWidth={ACT_DEFAULT_WIDTH}
                minHeight={isSelected ? ACT_MIN_EXPANDED_HEIGHT : collapsedHeight}
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
                        focused={isFocused}
                        editing={isEditing}
                        showActivity={showActivity}
                        onToggleFocus={handleToggleFocus}
                        onToggleActivity={() => setShowActivity(!showActivity)}
                        onEdit={handleEditAct}
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
