import { useCallback, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import { useStudioStore } from '../../store'
import './PerformerRelationEdge.css'

export default function PerformerRelationEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
}: EdgeProps) {
    const removeEdge = useStudioStore((state) => state.removeEdge)
    const updateEdgeDescription = useStudioStore((state) => state.updateEdgeDescription)
    const [editing, setEditing] = useState(false)
    const [hovered, setHovered] = useState(false)

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    })

    const description = typeof (data as any)?.description === 'string' ? (data as any).description : ''

    const handleDelete = useCallback((event: React.MouseEvent) => {
        event.stopPropagation()
        removeEdge(id)
    }, [id, removeEdge])

    const handleBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
        updateEdgeDescription(id, event.target.value.trim())
        setEditing(false)
    }, [id, updateEdgeDescription])

    return (
        <>
            <BaseEdge id={id} path={edgePath} className="performer-relation-edge__path" interactionWidth={22} />
            <EdgeLabelRenderer>
                <div
                    className={`performer-relation-edge__label ${hovered ? 'is-hovered' : ''}`}
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    {editing ? (
                        <input
                            className="performer-relation-edge__input"
                            defaultValue={description}
                            onBlur={handleBlur}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    ;(event.target as HTMLInputElement).blur()
                                }
                                if (event.key === 'Escape') {
                                    setEditing(false)
                                }
                            }}
                            autoFocus
                            placeholder="Describe request..."
                        />
                    ) : (
                        <button
                            className="performer-relation-edge__text"
                            onDoubleClick={() => setEditing(true)}
                            type="button"
                            title="Double-click to edit relation"
                        >
                            {description || 'request'}
                        </button>
                    )}
                    {hovered && !editing ? (
                        <button
                            className="performer-relation-edge__delete"
                            onClick={handleDelete}
                            type="button"
                            title="Remove relation"
                        >
                            <X size={10} />
                        </button>
                    ) : null}
                </div>
            </EdgeLabelRenderer>
        </>
    )
}
