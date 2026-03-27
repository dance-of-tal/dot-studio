import type { Edge } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { WorkspaceAct, PerformerNode } from '../../types'

function resolvePerformerNodeId(
    act: WorkspaceAct,
    participantKey: string,
    performers: PerformerNode[],
): string | null {
    const binding = act.participants[participantKey]
    if (!binding) return null
    const ref = binding.performerRef
    if (ref.kind === 'draft') return ref.draftId || null
    return performers.find((performer) => performer.meta?.derivedFrom === ref.urn)?.id || null
}

/**
 * Pick source/target handles based on relative node positions.
 * Source handles: top, right, bottom, left
 * Target handles: top-target, right-target, bottom-target, left-target
 */
function pickHandles(
    srcPos: { x: number; y: number },
    tgtPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
    const dx = tgtPos.x - srcPos.x
    const dy = tgtPos.y - srcPos.y

    if (Math.abs(dx) >= Math.abs(dy)) {
        // Target is mostly horizontal
        return dx >= 0
            ? { sourceHandle: 'right', targetHandle: 'left' }
            : { sourceHandle: 'left', targetHandle: 'right' }
    } else {
        // Target is mostly vertical
        return dy >= 0
            ? { sourceHandle: 'bottom', targetHandle: 'top' }
            : { sourceHandle: 'top', targetHandle: 'bottom' }
    }
}

const PAIR_OFFSET = 50

function buildRelationEdges(
    acts: WorkspaceAct[],
    performers: PerformerNode[],
    posMap: Map<string, { x: number; y: number }>,
): Edge[] {
    const edges: Edge[] = []
    const pairTotals = new Map<string, number>()
    const pairCounts = new Map<string, number>()

    // First pass: count totals per pair
    for (const act of acts) {
        for (const relation of act.relations) {
            const s = resolvePerformerNodeId(act, relation.between[0], performers)
            const t = resolvePerformerNodeId(act, relation.between[1], performers)
            if (!s || !t) continue
            const key = [s, t].sort().join(':')
            pairTotals.set(key, (pairTotals.get(key) || 0) + 1)
        }
    }

    // Second pass: build edges
    for (const act of acts) {
        for (const relation of act.relations) {
            const sourceId = resolvePerformerNodeId(act, relation.between[0], performers)
            const targetId = resolvePerformerNodeId(act, relation.between[1], performers)
            if (!sourceId || !targetId) continue

            const pairKey = [sourceId, targetId].sort().join(':')
            const idx = pairCounts.get(pairKey) || 0
            pairCounts.set(pairKey, idx + 1)
            const total = pairTotals.get(pairKey) || 1

            // Compute offset for parallel edges
            let offset = 0
            if (total === 2) {
                offset = idx === 0 ? -PAIR_OFFSET : PAIR_OFFSET
            } else if (total > 2) {
                const center = (total - 1) / 2
                offset = (idx - center) * PAIR_OFFSET
            }

            // Pick handles based on relative position
            const srcPos = posMap.get(sourceId)
            const tgtPos = posMap.get(targetId)
            const handles = srcPos && tgtPos
                ? pickHandles(srcPos, tgtPos)
                : { sourceHandle: 'right', targetHandle: 'left-target' }

            const isOneWay = relation.direction === 'one-way'

            edges.push({
                id: `rel:${act.id}:${relation.id}`,
                source: sourceId,
                target: targetId,
                sourceHandle: handles.sourceHandle,
                targetHandle: handles.targetHandle,
                type: 'offsetBezier',
                animated: isOneWay,
                data: { offset },
                label: relation.name || undefined,
                ...(isOneWay ? {
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 16,
                        height: 16,
                        color: 'var(--info, #58f)',
                    },
                } : {
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 12,
                        height: 12,
                        color: 'var(--accent)',
                    },
                    markerStart: {
                        type: MarkerType.ArrowClosed,
                        width: 12,
                        height: 12,
                        color: 'var(--accent)',
                    },
                }),
                style: {
                    stroke: isOneWay ? 'var(--info, #58f)' : 'var(--accent)',
                    strokeWidth: isOneWay ? 2 : 1.5,
                    strokeDasharray: isOneWay ? '6 3' : undefined,
                },
            })
        }
    }

    return edges
}

export function composeCanvasEdges(
    acts: WorkspaceAct[],
    editingActId: string | null,
    performers?: PerformerNode[],
) {
    if (!editingActId) return []
    const editingAct = acts.find((act) => act.id === editingActId)
    if (!editingAct) return []

    const posMap = new Map<string, { x: number; y: number }>()
    if (performers) {
        for (const p of performers) {
            posMap.set(p.id, p.position)
        }
    }

    return buildRelationEdges([editingAct], performers || [], posMap)
}
