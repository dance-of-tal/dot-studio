import type { Connection, Node } from '@xyflow/react'

type ConnectRouterArgs = {
    connection: Connection
    nodes: Node[]
    onCreateActFromPerformers: (performerIds: [string, string]) => void
    onAttachPerformerToAct: (actId: string, performerId: string) => void
}

export function routeActConnection(args: ConnectRouterArgs) {
    const {
        connection,
        nodes,
        onCreateActFromPerformers,
        onAttachPerformerToAct,
    } = args

    if (!connection.source || !connection.target) return false

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

    return false
}
