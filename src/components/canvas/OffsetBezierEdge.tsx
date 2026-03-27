import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

/**
 * Custom bezier edge with perpendicular offset for parallel edges.
 * 
 * KEY INSIGHT: The perpendicular vector must be computed from a
 * consistent reference direction, NOT from source→target, because
 * A→B and B→A have opposite directions which would cancel out the offset.
 * We always compute perpendicular from the lexicographically smaller
 * coordinate pair to ensure consistency.
 */
export default function OffsetBezierEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    style,
    markerEnd,
    markerStart,
    label,
}: EdgeProps) {
    const offset = (data?.offset as number) || 0

    // Use a CONSISTENT direction for perpendicular computation
    // Always compute from the "lower" point to the "higher" point
    // so that A→B and B→A produce the SAME perpendicular direction
    const isForward = sourceX < targetX || (sourceX === targetX && sourceY < targetY)
    const refDx = isForward ? (targetX - sourceX) : (sourceX - targetX)
    const refDy = isForward ? (targetY - sourceY) : (sourceY - targetY)
    const len = Math.sqrt(refDx * refDx + refDy * refDy) || 1

    // Perpendicular unit vector (consistent direction)
    const px = -refDy / len
    const py = refDx / len

    // Actual direction for control point placement (source → target)
    const dx = targetX - sourceX
    const dy = targetY - sourceY

    // Push control points perpendicular to the line
    const cpOffset = offset * 2
    const cp1x = sourceX + dx * 0.25 + px * cpOffset
    const cp1y = sourceY + dy * 0.25 + py * cpOffset
    const cp2x = sourceX + dx * 0.75 + px * cpOffset
    const cp2y = sourceY + dy * 0.75 + py * cpOffset

    // SVG cubic bezier path
    const path = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`

    // Label position: midpoint of the curve
    const labelX = sourceX * 0.125 + cp1x * 0.375 + cp2x * 0.375 + targetX * 0.125
    const labelY = sourceY * 0.125 + cp1y * 0.375 + cp2y * 0.375 + targetY * 0.125

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                style={style}
                markerEnd={markerEnd}
                markerStart={markerStart}
            />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        className="react-flow__edge-label"
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: 'all',
                            background: 'var(--bg-surface)',
                            opacity: 0.9,
                            padding: '3px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                        }}
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    )
}
