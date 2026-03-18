import type { Connection, Node } from '@xyflow/react'

type ConnectRouterArgs = {
    isActLayoutMode: boolean
    layoutActId: string | null
    connection: Connection
    nodes: Node[]
    onAddLayoutRelation: (between: [string, string]) => void
    onCreateActFromPerformers: (performerIds: [string, string]) => void
    onAttachPerformerToAct: (actId: string, performerId: string) => void
    resolveActLayoutRelation: (connection: Pick<Connection, 'source' | 'target'>) => [string, string] | null
    shouldHandleActLayoutConnection: (isActLayoutMode: boolean, layoutActId: string | null, connection: Pick<Connection, 'source' | 'target'>) => boolean
}

export function routeActConnection(args: ConnectRouterArgs) {
    const {
        isActLayoutMode,
        layoutActId,
        connection,
        nodes,
        onAddLayoutRelation,
        onCreateActFromPerformers,
        onAttachPerformerToAct,
        resolveActLayoutRelation,
        shouldHandleActLayoutConnection,
    } = args

    if (shouldHandleActLayoutConnection(isActLayoutMode, layoutActId, connection)) {
        const relation = resolveActLayoutRelation(connection)
        if (relation) {
            onAddLayoutRelation(relation)
            return true
        }
        return false
    }

    if (!isActLayoutMode && connection.source && connection.target) {
        const sourceNode = nodes.find((node) => node.id === connection.source)
        const targetNode = nodes.find((node) => node.id === connection.target)
        if (sourceNode?.type === 'performer' && targetNode?.type === 'performer') {
            onCreateActFromPerformers([connection.source, connection.target])
            return true
        }

        if (sourceNode?.type === 'performer' && targetNode?.type === 'act') {
            onAttachPerformerToAct(connection.target, connection.source)
            return true
        }

        if (sourceNode?.type === 'act' && targetNode?.type === 'performer') {
            onAttachPerformerToAct(connection.source, connection.target)
            return true
        }
    }

    return false
}
