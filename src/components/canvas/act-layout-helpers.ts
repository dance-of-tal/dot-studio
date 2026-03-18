import type { Edge, Node } from '@xyflow/react'
import type { StageAct } from '../../types'

export function buildActLayoutNodes(act: StageAct | null | undefined, layoutActId: string) {
    if (!act) return []
    return Object.entries(act.performers).map(([key, binding]) => ({
        id: `act-p-${key}`,
        type: 'act-performer' as const,
        position: binding.position,
        dragHandle: '.canvas-frame__header',
        data: { performerKey: key, actId: layoutActId },
    })) satisfies Node[]
}

export function buildActLayoutEdges(act: StageAct | null | undefined) {
    if (!act) return []
    return act.relations.map((relation) => ({
        id: relation.id,
        source: `act-p-${relation.between[0]}`,
        target: `act-p-${relation.between[1]}`,
        type: 'default',
        animated: relation.direction === 'one-way',
        label: relation.name || relation.description || undefined,
        style: {
            stroke: relation.direction === 'one-way' ? 'var(--info, #58f)' : 'var(--accent)',
            strokeWidth: 1.5,
            strokeDasharray: relation.direction === 'one-way' ? '5 3' : undefined,
        },
    })) satisfies Edge[]
}
