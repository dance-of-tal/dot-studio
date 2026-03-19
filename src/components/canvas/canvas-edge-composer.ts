import type { Edge } from '@xyflow/react'
import type { StageAct } from '../../types'

/**
 * Resolve participant key → performer node id by examining the Act's
 * participant binding.  Draft refs use the draftId directly (which is
 * the performer node id).  Registry refs use the urn as fallback,
 * relying on React Flow ignoring edges whose source/target don't exist.
 */
function resolvePerformerNodeId(act: StageAct, participantKey: string): string | null {
    const binding = act.participants[participantKey]
    if (!binding) return null
    const ref = binding.performerRef
    if (ref.kind === 'draft') return ref.draftId || null
    return ref.urn || null
}

function buildRelationEdges(acts: StageAct[]): Edge[] {
    const edges: Edge[] = []
    for (const act of acts) {
        for (const relation of act.relations) {
            const sourceId = resolvePerformerNodeId(act, relation.between[0])
            const targetId = resolvePerformerNodeId(act, relation.between[1])
            if (!sourceId || !targetId) continue

            edges.push({
                id: `rel-${act.id}-${relation.id}`,
                source: sourceId,
                target: targetId,
                type: 'default',
                animated: relation.direction === 'one-way',
                label: relation.name || undefined,
                style: {
                    stroke: relation.direction === 'one-way' ? 'var(--info, #58f)' : 'var(--accent)',
                    strokeWidth: 1.5,
                    strokeDasharray: relation.direction === 'one-way' ? '5 3' : undefined,
                },
            })
        }
    }
    return edges
}

export function composeCanvasEdges(acts: StageAct[]) {
    return buildRelationEdges(acts)
}
