/**
 * ActFrame — Canvas node representing an Act.
 *
 * Always renders ActChatPanel (chat mode).
 * Edit button enters Act edit focus mode (separate canvas view with ActPerformerFrame nodes).
 */
import { useMemo, useState } from 'react'
import { Workflow, Pencil, EyeOff, Activity } from 'lucide-react'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import ActChatPanel from './ActChatPanel'
import ActActivityView from './ActActivityView'
import './ActFrame.css'

export default function ActFrame({ data, id }: any) {
    const {
        acts,
        selectedActId,
        enterActEditFocus,
        toggleActVisibility,
        updateActSize,
        activeThreadId,
        actThreads,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === id), [acts, id])
    const [showActivity, setShowActivity] = useState(false)
    if (!act) return null

    const isSelected = selectedActId === id
    const width = data.width || act.width || 340
    const height = Math.max(250, act.height || 420)

    const handleResizeEnd = () => {
        const node = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
        if (node) {
            const rect = node.getBoundingClientRect()
            updateActSize(id, Math.round(rect.width), Math.round(rect.height))
        }
    }

    return (
        <CanvasWindowFrame
            className={`act-frame nowheel ${isSelected ? 'act-frame--selected' : ''} act-frame--chat`}
            width={width}
            height={height}
            resizable
            minWidth={340}
            minHeight={250}
            transformActive={data.transformActive || false}
            onActivateTransform={data.onActivateTransform}
            onDeactivateTransform={data.onDeactivateTransform}
            onResizeEnd={handleResizeEnd}
            selected={isSelected}
            headerStart={
                <div className="act-frame__title" onClick={() => useStudioStore.getState().selectAct(id)}>
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
                        className={`icon-btn act-frame__activity-btn ${showActivity ? 'active' : ''}`}
                        title="Activity"
                        onClick={() => setShowActivity(!showActivity)}
                    >
                        <Activity size={11} />
                    </button>
                    <button
                        className="icon-btn act-frame__edit-btn"
                        title="Edit Act"
                        onClick={() => enterActEditFocus(id)}
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
            {showActivity ? (
                <ActActivityView actId={id} threadId={activeThreadId} />
            ) : (
                <ActChatPanel actId={id} />
            )}
        </CanvasWindowFrame>
    )
}
