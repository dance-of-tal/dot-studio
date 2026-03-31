/**
 * ActFrame — runtime-first Act canvas window with explicit edit mode.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Workflow } from 'lucide-react'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import {
    ACT_DEFAULT_WIDTH,
    ACT_MIN_EXPANDED_HEIGHT,
    resolveActExpandedHeight,
} from '../../lib/act-layout'
import { resolveActThreadOrdinal, resolveDisplayedActThread } from '../../lib/act-threads'
import ActHeaderActions from './ActHeaderActions'
import ActSurfacePanel from './ActSurfacePanel'
import { getCanvasViewportSize, resolveFocusNodeId, scheduleFitView } from '../../lib/focus-utils'
import { evaluateActReadiness } from './act-readiness'
import './ActFrame.css'

const EMPTY_THREADS: never[] = []

type ActFrameData = {
    width?: number
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

export default function ActFrame({ data, id }: NodeProps<ActFrameData>) {
    const {
        acts,
        performers,
        selectedActId,
        actEditorState,
        selectAct,
        openActEditor,
        closeActEditor,
        toggleActVisibility,
        activeThreadId,
        actThreads,
        focusedPerformerId,
        focusSnapshot,
        enterFocusMode,
        exitFocusMode,
    } = useStudioStore()
    const bodyRef = useRef<HTMLDivElement>(null)

    const act = useMemo(() => acts.find((a) => a.id === id), [acts, id])
    const readiness = useMemo(
        () => act ? evaluateActReadiness(act, performers) : { runnable: false, issues: [] },
        [act, performers],
    )

    const isSelected = selectedActId === id
    const isEditing = actEditorState?.actId === id
    const focusNodeId = resolveFocusNodeId(focusSnapshot, focusedPerformerId)
    const isFocused = focusSnapshot?.type === 'act' && focusNodeId === id
    const width = data.width || act?.width || ACT_DEFAULT_WIDTH
    const height = resolveActExpandedHeight(act?.height)
    const threads = useMemo(() => actThreads[id] || EMPTY_THREADS, [actThreads, id])
    const displayedThread = useMemo(
        () => resolveDisplayedActThread(threads, activeThreadId),
        [activeThreadId, threads],
    )
    const displayedThreadOrdinal = useMemo(
        () => resolveActThreadOrdinal(threads, displayedThread?.id || null),
        [displayedThread?.id, threads],
    )

    const { fitView: rfFitView } = useReactFlow()

    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const handler = (event: WheelEvent) => { event.stopPropagation() }
        el.addEventListener('wheel', handler, { passive: true })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    const handleSelectAct = () => selectAct(id)
    const handleToggleEdit = () => {
        if (isEditing) {
            closeActEditor()
            return
        }
        openActEditor(id, 'act')
    }
    const handleToggleFocus = useCallback(() => {
        if (isFocused) {
            exitFocusMode()
            scheduleFitView(rfFitView, 'exit')
            return
        }

        enterFocusMode(id, 'act', getCanvasViewportSize())
    }, [enterFocusMode, exitFocusMode, id, isFocused, rfFitView])

    if (!act) {
        return null
    }

    return (
        <div className="act-frame-shell">
            <CanvasWindowFrame
                className={`act-frame nowheel ${isSelected ? 'act-frame--selected' : ''} ${isEditing ? 'act-frame--editing' : ''} ${isFocused ? 'canvas-frame--focused' : ''} act-frame--chat`}
                width={width}
                height={height}
                focused={isFocused}
                minWidth={ACT_DEFAULT_WIDTH}
                minHeight={ACT_MIN_EXPANDED_HEIGHT}
                transformActive={data.transformActive || false}
                onActivateTransform={data.onActivateTransform}
                onDeactivateTransform={data.onDeactivateTransform}
                selected={isSelected}
                headerStart={
                    <div className="act-frame__title" onClick={handleSelectAct}>
                        <Workflow size={12} className="act-frame__icon" />
                        <span className="act-frame__name">{act.name}</span>
                        {displayedThreadOrdinal ? (
                            <span className="act-frame__thread-chip">
                                #{displayedThreadOrdinal}
                            </span>
                        ) : null}
                    </div>
                }
                headerEnd={(
                    <ActHeaderActions
                        focused={isFocused}
                        editing={isEditing}
                        readiness={readiness}
                        onToggleFocus={handleToggleFocus}
                        onToggleEdit={handleToggleEdit}
                        onHide={() => toggleActVisibility(id)}
                    />
                )}
                bodyClassName="nowheel nodrag"
                bodyRef={bodyRef}
            >
                <ActSurfacePanel actId={id} />
            </CanvasWindowFrame>
        </div>
    )
}
