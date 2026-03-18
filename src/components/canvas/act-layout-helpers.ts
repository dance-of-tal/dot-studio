import type { Connection, Edge, Node } from '@xyflow/react'
import type { StageAct } from '../../types'

export function buildActLayoutNodes(act: StageAct | null | undefined, layoutActId: string) {
    if (!act) return []
    return Object.entries(act.performers).map(([key, binding]) => ({
        id: `act-p-${key}`,
        type: 'act-participant' as const,
        position: binding.position,
        dragHandle: '.canvas-frame__header',
        data: { participantKey: key, actId: layoutActId },
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

export function actLayoutParticipantKey(nodeId: string) {
    return nodeId.replace(/^act-p-/, '')
}

export function isActLayoutParticipantNode(node: Pick<Node, 'type'> | { type?: string }) {
    return node.type === 'act-participant'
}

export function resolveActLayoutRelation(connection: Pick<Connection, 'source' | 'target'>) {
    if (!connection.source || !connection.target) return null
    return [
        actLayoutParticipantKey(connection.source),
        actLayoutParticipantKey(connection.target),
    ] as [string, string]
}

export function actLayoutDragPosition(node: Pick<Node, 'id' | 'position' | 'type'>, layoutActId: string | null) {
    if (!layoutActId || !isActLayoutParticipantNode(node)) return null
    return {
        actId: layoutActId,
        participantKey: actLayoutParticipantKey(node.id),
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
    }
}

export function actLayoutSelection(node: Pick<Node, 'id' | 'type'>) {
    if (!isActLayoutParticipantNode(node)) return null
    return actLayoutParticipantKey(node.id)
}

export function actLayoutEdgeSelection(edge: Pick<Edge, 'id'>) {
    return edge.id
}

export function isActLayoutActive(focusSnapshotType: string | undefined, layoutActId: string | null) {
    return focusSnapshotType === 'act' && !!layoutActId
}

export function shouldHandleActLayoutConnection(isActLayoutMode: boolean, layoutActId: string | null, connection: Pick<Connection, 'source' | 'target'>) {
    return !!(isActLayoutMode && layoutActId && connection.source && connection.target)
}

export function shouldResetActLayoutSelection(isActLayoutMode: boolean) {
    return isActLayoutMode
}
