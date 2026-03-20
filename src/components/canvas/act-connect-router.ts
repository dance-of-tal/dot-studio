import type { Connection, Node } from '@xyflow/react'

type ConnectRouterArgs = {
    currentActId: string | null
    connection: Connection
    nodes: Node[]
    onConnectPerformersInAct: (actId: string, performerIds: [string, string]) => void
}

export function routeActConnection(args: ConnectRouterArgs) {
    const {
        currentActId,
        connection,
        nodes,
        onConnectPerformersInAct,
    } = args

    if (!currentActId || !connection.source || !connection.target || connection.source === connection.target) {
        return false
    }

    const sourceNode = nodes.find((node) => node.id === connection.source)
    const targetNode = nodes.find((node) => node.id === connection.target)

    if (sourceNode?.type === 'performer' && targetNode?.type === 'performer') {
        onConnectPerformersInAct(currentActId, [connection.source, connection.target])
        return true
    }

    return false
}
