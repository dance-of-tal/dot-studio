// Canonical Act contracts shared by client and server.
// PRD-001 keeps Act as a first-class entity, but its runtime model is
// intentionally narrow: worker nodes connected by request edges.

export type ActNodeType = 'worker'

export type StageActWorkerNode = {
    id: string
    type: 'worker'
    performerId: string | null
    modelVariant?: string | null
    position: { x: number; y: number }
    label?: string
}

export type StageActNode = StageActWorkerNode

export type StageActEdge = {
    id?: string
    from: string
    to: string
    description?: string
}

export type ActHistoryEntry = {
    nodeId: string
    nodeType: 'worker'
    action: string
    timestamp: number
}

export type ActThreadResumeSummary = {
    updatedAt: number
    runId?: string | null
    currentNodeId?: string | null
    finalOutput?: string
    error?: string
    iterations?: number
    nodeOutputs?: Record<string, string>
    history?: ActHistoryEntry[]
    sessionHandles?: Array<{
        handle: string
        nodeId: string
        nodeType: 'worker'
        performerId?: string | null
        status: 'warm'
        turnCount: number
        lastUsedAt: number
        summary?: string
    }>
}

export type RunActRequest = {
    actSessionId?: string
    actUrn?: string
    stageAct?: unknown
    performers?: unknown[]
    drafts?: Record<string, unknown>
    input: string
    maxIterations?: number
    resumeSummary?: unknown
}
