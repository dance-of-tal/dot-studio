/**
 * ActFrame — runtime-first Act canvas window with explicit edit mode.
 */
import { useMemo } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Workflow } from 'lucide-react'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import {
    ACT_DEFAULT_WIDTH,
    ACT_MIN_EXPANDED_HEIGHT,
    resolveActExpandedHeight,
} from '../../lib/act-layout'
import ActHeaderActions from './ActHeaderActions'
import ActSurfacePanel from './ActSurfacePanel'
import { scheduleFitView } from '../../lib/focus-utils'
import './ActFrame.css'

type ActFrameData = {
    width?: number
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

export default function ActFrame({ data, id }: NodeProps<ActFrameData>) {
    const {
        acts,
        selectedActId,
        actEditorState,
        selectAct,
        openActEditor,
        closeActEditor,
        toggleActVisibility,
        activeThreadId,
        actThreads,
        focusedPerformerId, focusedNodeType,
        enterFocusMode,
        exitFocusMode,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === id), [acts, id])

    const isSelected = selectedActId === id
    const isEditing = actEditorState?.actId === id
    const isFocused = focusedPerformerId === id && focusedNodeType === 'act'
    const rfWidth = useStore((state) => state.width)
    const rfHeight = useStore((state) => state.height)
    const width = data.width || act?.width || ACT_DEFAULT_WIDTH
    const height = resolveActExpandedHeight(act?.height)

    const { fitView: rfFitView } = useReactFlow()

    const handleSelectAct = () => selectAct(id)
    const handleToggleEdit = () => {
        if (isEditing) {
            closeActEditor()
            return
        }
        openActEditor(id, 'act')
    }
    const handleToggleFocus = () => {
        if (isFocused) {
            exitFocusMode()
            scheduleFitView(rfFitView, 'exit')
            return
        }

        enterFocusMode(id, 'act', {
            width: rfWidth || 1200,
            height: rfHeight || 800,
        })
        scheduleFitView(rfFitView, 'enter')
    }

    if (!act) {
        return null
    }

    return (
        <div className="act-frame-shell">
            <CanvasWindowFrame
                className={`act-frame nowheel ${isSelected ? 'act-frame--selected' : ''} ${isEditing ? 'act-frame--editing' : ''} ${isFocused ? 'canvas-frame--focused' : ''} act-frame--chat`}
                width={width}
                height={height}
                resizable={isSelected}
                minWidth={ACT_DEFAULT_WIDTH}
                minHeight={ACT_MIN_EXPANDED_HEIGHT}
                transformActive={isSelected ? data.transformActive || false : false}
                onActivateTransform={data.onActivateTransform}
                onDeactivateTransform={data.onDeactivateTransform}
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
                headerEnd={(
                    <ActHeaderActions
                        focused={isFocused}
                        editing={isEditing}
                        onToggleFocus={handleToggleFocus}
                        onToggleEdit={handleToggleEdit}
                        onHide={() => toggleActVisibility(id)}
                    />
                )}
            >
                <ActSurfacePanel actId={id} />
            </CanvasWindowFrame>
        </div>
    )
}
