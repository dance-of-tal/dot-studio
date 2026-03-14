/**
 * RelationEdge — Custom React Flow edge for performer relations.
 *
 * Shows a styled edge between performers with:
 * - Animated dashed line for 'request' interactions
 * - Label with description on hover
 * - Delete button on hover
 */

import { useCallback, useState } from 'react'
import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    type EdgeProps,
} from '@xyflow/react'
import { X } from 'lucide-react'
import { useStudioStore } from '../../store'
import './RelationEdge.css'

export default function RelationEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
}: EdgeProps) {
    const removeEdge = useStudioStore((s) => s.removeEdge)
    const updateEdgeDescription = useStudioStore((s) => s.updateEdgeDescription)
    const [isHovered, setIsHovered] = useState(false)
    const [isEditing, setIsEditing] = useState(false)

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    })

    const description = (data as any)?.description || ''
    const interaction = (data as any)?.interaction || 'request'

    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            removeEdge(id)
        },
        [id, removeEdge],
    )

    const handleDescriptionChange = useCallback(
        (e: React.FocusEvent<HTMLInputElement>) => {
            const val = e.target.value.trim()
            updateEdgeDescription(id, val)
            setIsEditing(false)
        },
        [id, updateEdgeDescription],
    )

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') {
                setIsEditing(false)
            }
        },
        [],
    )

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                className="relation-edge__path"
                interactionWidth={20}
            />
            <EdgeLabelRenderer>
                <div
                    className={`relation-edge__label ${isHovered ? 'is-hovered' : ''}`}
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {isEditing ? (
                        <input
                            className="relation-edge__input"
                            defaultValue={description}
                            onBlur={handleDescriptionChange}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            placeholder="Describe this relation..."
                        />
                    ) : (
                        <span
                            className="relation-edge__text"
                            onDoubleClick={() => setIsEditing(true)}
                            title="Double-click to edit description"
                        >
                            {description || interaction}
                        </span>
                    )}
                    {isHovered && !isEditing && (
                        <button
                            className="relation-edge__delete"
                            onClick={handleDelete}
                            title="Remove relation"
                        >
                            <X size={10} />
                        </button>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    )
}
