import type { DanceDeliveryMode, ModelSelection } from './prompt.js'
import { getOpencode } from './opencode.js'

export type ActSessionPolicy = 'fresh' | 'node' | 'performer' | 'act'
export type ActSessionLifetime = 'run' | 'thread'
export type ActSessionMode = 'default' | 'all_nodes_thread'
export type RuntimeAssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }
export type RuntimeDraftAsset = {
    id: string
    kind: 'tal' | 'dance' | 'performer' | 'act'
    name: string
    content: unknown
    description?: string
    derivedFrom?: string | null
}

export type StagePerformerInput = {
    id: string
    name: string
    model?: ModelSelection
    modelVariant?: string | null
    agentId?: string | null
    talRef?: RuntimeAssetRef | null
    danceRefs?: RuntimeAssetRef[]
    mcpServerNames?: string[]
    declaredMcpConfig?: Record<string, unknown> | null
    danceDeliveryMode?: DanceDeliveryMode
    planMode?: boolean
    meta?: {
        derivedFrom?: string | null
    }
}

export type StageActWorkerNode = {
    id: string
    type: 'worker'
    performerId: string | null
    modelVariant?: string | null
    position: { x: number; y: number }
    sessionPolicy: ActSessionPolicy
    sessionLifetime: ActSessionLifetime
    sessionModeOverride?: boolean
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
}

export type StageActParallelNode = {
    id: string
    type: 'parallel'
    position: { x: number; y: number }
    join: 'all' | 'any'
}

export type StageActNode = StageActWorkerNode | StageActOrchestratorNode | StageActParallelNode

export type StageActEdge = {
    id?: string
    from: string
    to: string
    role?: 'branch'
    condition?: 'always' | 'on_success' | 'on_fail'
}

export type StageActInput = {
    id: string
    name: string
    description: string
    sessionMode?: ActSessionMode
    bounds?: {
        x: number
        y: number
        width: number
        height: number
    }
    entryNodeId: string | null
    nodes: StageActNode[]
    edges: StageActEdge[]
    maxIterations: number
    meta?: {
        derivedFrom?: string | null
    }
}

export type RuntimePerformer = {
    id: string
    name: string
    model: ModelSelection
    modelVariant?: string | null
    agentId?: string | null
    talRef: RuntimeAssetRef | null
    danceRefs: RuntimeAssetRef[]
    mcpServerNames: string[]
    danceDeliveryMode: DanceDeliveryMode
    planMode: boolean
}

export type SessionRecord = {
    scopeKey: string
    sessionId: string
    configKey?: string
    policy: ActSessionPolicy
    lifetime?: ActSessionLifetime
    nodeId?: string | null
    performerId?: string | null
    persistentHandle?: string | null
}

export type ThreadSessionHandleRecord = {
    handle: string
    sessionId: string
    configKey?: string
    nodeId: string
    nodeType: 'worker' | 'orchestrator'
    performerId?: string | null
    status: 'warm'
    turnCount: number
    lastUsedAt: number
    summary?: string
}

export type ActHistoryEntry = {
    nodeId: string
    nodeType: 'worker' | 'orchestrator' | 'parallel'
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

export type PendingSessionDirective = {
    nodeId: string
    mode: 'fresh' | 'reuse'
    handle?: string | null
}

export type ResolvedSession = {
    oc: Awaited<ReturnType<typeof getOpencode>>
    sessionId: string
    configKey: string
    scopeKey?: string
    ephemeral: boolean
    source: 'fresh' | 'run' | 'thread'
}

export type ActMachineContext = {
    runId: string
    actSessionId?: string | null
    cwd: string
    act: StageActInput
    performersById: Record<string, RuntimePerformer>
    drafts: Record<string, RuntimeDraftAsset>
    currentNodeId: string | null
    pendingInput: string
    maxIterations: number
    iterations: number
    history: ActHistoryEntry[]
    sharedState: Record<string, unknown>
    nodeOutputs: Record<string, string>
    resumeSummary?: ActThreadResumeSummary | null
    sessionPool: Map<string, SessionRecord>
    threadSessionHandles: Map<string, ThreadSessionHandleRecord>
    pendingSessionDirective?: PendingSessionDirective | null
    finalOutput?: string
    error?: string
}

export type ActMachineOutput = {
    status: 'completed' | 'failed' | 'interrupted'
    context: ActMachineContext
}

export type ActRuntimeProgressEvent = {
    type: 'act.runtime'
    actSessionId: string
    actId: string
    runId: string
    status: 'running' | 'completed' | 'failed' | 'interrupted'
    summary: ActThreadResumeSummary
}

export type ActPerformerBindingEvent = {
    type: 'act.performer.binding'
    actSessionId: string
    actId: string
    runId: string
    sessionId: string
    nodeId: string
    nodeLabel: string
    performerId?: string | null
    performerName?: string | null
}

export type ActRuntimeEvent = ActRuntimeProgressEvent | ActPerformerBindingEvent

export type StepResult = {
    status: 'continue' | 'completed' | 'failed' | 'interrupted'
    context: ActMachineContext
}

export type RunActRuntimeInput = {
    cwd: string
    actSessionId?: string
    actUrn?: string
    stageAct?: StageActInput
    performers?: StagePerformerInput[]
    drafts?: Record<string, RuntimeDraftAsset>
    input: string
    maxIterations?: number
    resumeSummary?: ActThreadResumeSummary
}
