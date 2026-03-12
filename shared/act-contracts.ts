// ── Shared Act Contracts ─────────────────────────────────────
// Canonical type definitions shared between client (src/) and server (server/).
// Both sides re-export from this file.

// ── Session Types ────────────────────────────────────────────

export type ActSessionPolicy = 'fresh' | 'node' | 'performer' | 'act'
export type ActSessionLifetime = 'run' | 'thread'
export type ActSessionMode = 'default' | 'all_nodes_thread'
export type ActNodeType = 'worker' | 'orchestrator' | 'parallel'

// ── Node Types ───────────────────────────────────────────────

export type StageActWorkerNode = {
    id: string
    type: 'worker'
    performerId: string | null
    modelVariant?: string | null
    position: { x: number; y: number }
    sessionPolicy: ActSessionPolicy
    sessionLifetime: ActSessionLifetime
    sessionModeOverride?: boolean
    label?: string
}

export type StageActOrchestratorNode = {
    id: string
    type: 'orchestrator'
    performerId: string | null
    modelVariant?: string | null
    position: { x: number; y: number }
    maxDelegations?: number
    sessionPolicy: ActSessionPolicy
    sessionLifetime: ActSessionLifetime
    sessionModeOverride?: boolean
    label?: string
}

export type StageActParallelNode = {
    id: string
    type: 'parallel'
    position: { x: number; y: number }
    join: 'all' | 'any'
    label?: string
}

export type StageActNode = StageActWorkerNode | StageActOrchestratorNode | StageActParallelNode

// ── Edge Types ───────────────────────────────────────────────

export type StageActEdge = {
    id?: string
    from: string
    to: string
    role?: 'branch'
    condition?: 'always' | 'on_success' | 'on_fail'
}

// ── History / Resume ─────────────────────────────────────────

export type ActHistoryEntry = {
    nodeId: string
    nodeType: ActNodeType
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
        nodeType: 'worker' | 'orchestrator'
        performerId?: string | null
        status: 'warm'
        turnCount: number
        lastUsedAt: number
        summary?: string
    }>
}

// ── Request/Response ─────────────────────────────────────────

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
