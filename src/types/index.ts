// DOT Studio — Core Types

import type { RuntimeModelVariant } from '../../shared/model-variants'
import type {
    ActSessionPolicy,
    ActSessionLifetime,
    ActSessionMode,
    ActNodeType,
    StageActWorkerNode,
    StageActOrchestratorNode,
    StageActParallelNode,
    StageActNode,
    StageActEdge,
    ActHistoryEntry,
    ActThreadResumeSummary,
} from '../../shared/act-contracts'

export type {
    ActSessionPolicy,
    ActSessionLifetime,
    ActSessionMode,
    ActNodeType,
    StageActWorkerNode,
    StageActOrchestratorNode,
    StageActParallelNode,
    StageActNode,
    StageActEdge,
    ActHistoryEntry,
    ActThreadResumeSummary,
}

export type AssetKind = 'tal' | 'dance' | 'act' | 'performer' | 'model' | 'mcp'

export interface AssetCard {
    kind: AssetKind
    urn: string          // "tal/@acme/senior-engineer"
    name: string         // "senior-engineer"
    author: string       // "@acme"
    description?: string
    source?: 'global' | 'stage' | 'registry' | 'draft'
    tags?: string[]
    content?: string
    draftId?: string
    talUrn?: string | null
    danceUrns?: string[]
    actUrn?: string | null
    model?: ModelConfig | string | null
    mcpConfig?: Record<string, any> | null
    entryNode?: string | null
    nodeCount?: number
    connected?: boolean
    context?: number
    output?: number
    provider?: string
    providerName?: string
    id?: string
    toolCall?: boolean
    reasoning?: boolean
    attachment?: boolean
    temperature?: boolean
    modalities?: {
        input: string[]
        output: string[]
    }
    variants?: RuntimeModelVariant[]
    tools?: Array<{ name: string; description?: string }>
    resources?: Array<any>
}

export interface ModelConfig {
    provider: string     // "anthropic", "openai", "google"
    modelId: string      // "claude-sonnet-4-20250514"
    temperature?: number
    maxTokens?: number
}

export type DanceDeliveryMode = 'auto' | 'tool' | 'inline'
export type DraftAssetKind = 'tal' | 'dance' | 'performer' | 'act'
export type MarkdownEditorKind = 'tal' | 'dance'

export type RegistryAssetRef = {
    kind: 'registry'
    urn: string
}

export type DraftAssetRef = {
    kind: 'draft'
    draftId: string
}

export type AssetRef = RegistryAssetRef | DraftAssetRef

export interface DraftAsset {
    id: string
    kind: DraftAssetKind
    name: string
    content: unknown
    slug?: string
    description?: string
    tags?: string[]
    derivedFrom?: string | null
    updatedAt: number
}

export interface MarkdownEditorAttachTarget {
    performerId: string
    mode: 'tal' | 'dance-new' | 'dance-replace'
    targetRef?: AssetRef | null
}

export interface MarkdownEditorNode {
    id: string
    kind: MarkdownEditorKind
    position: { x: number; y: number }
    width: number
    height: number
    draftId: string
    baseline: {
        name: string
        slug?: string
        description?: string
        tags?: string[]
        content: string
    } | null
    attachTarget?: MarkdownEditorAttachTarget | null
    hidden?: boolean
}

export interface ModelCapabilities {
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    temperature: boolean
    modalities: {
        input: string[]
        output: string[]
    }
}

export interface McpServer {
    name: string           // "github", "postgres", etc.
    status: 'connected' | 'disconnected' | 'disabled' | 'failed' | 'needs_auth' | 'needs_client_registration' | 'unknown'
    tools: Array<{ name: string; description?: string }>
    resources: Array<any>
    enabled?: boolean
    defined?: boolean
    configType?: 'local' | 'remote' | 'toggle'
    authStatus?: 'ready' | 'needs_auth' | 'n/a'
    error?: string
    oauthConfigured?: boolean
    clientRegistrationRequired?: boolean
}

export type PerformerScope = 'shared' | 'act-owned'

export interface PerformerNode {
    id: string
    name: string
    position: { x: number; y: number }
    width?: number
    height?: number
    scope: PerformerScope
    ownerActId?: string | null
    model: ModelConfig | null
    modelPlaceholder?: ModelConfig | null
    modelVariant?: string | null
    agentId?: string | null
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    mcpServerNames: string[]
    mcpBindingMap?: Record<string, string>
    declaredMcpConfig?: Record<string, any> | null
    configHash: string
    activeSessionId?: string
    danceDeliveryMode: DanceDeliveryMode
    // Legacy fallback for older saved stages. Runtime code should prefer agentId.
    planMode?: boolean
    hidden?: boolean
    autoCompact?: boolean
    meta?: {
        derivedFrom?: string | null
        publishBindingUrn?: string | null
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}

export interface PerformerLink {
    id: string
    from: string
    to: string        // node ID or '$exit'
    condition?: string
}



export interface StageAct {
    id: string
    name: string
    description: string
    hidden?: boolean
    sessionMode?: ActSessionMode
    bounds: {
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
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}

export interface CanvasTerminalNode {
    id: string
    title: string
    position: { x: number; y: number }
    width: number
    height: number
    sessionId: string | null
    connected: boolean
}

export interface CanvasTrackingWindow {
    id: string
    title: string
    position: { x: number; y: number }
    width: number
    height: number
}

export interface Stage {
    schemaVersion: 3
    workingDir: string
    performers: PerformerNode[]
    performerLinks: PerformerLink[]
    acts: StageAct[]
    drafts: Record<string, DraftAsset>
    markdownEditors: MarkdownEditorNode[]
    canvasTerminals?: CanvasTerminalNode[]
    trackingWindow?: CanvasTrackingWindow | null
    actChats?: Record<string, ChatMessage[]>
    actPerformerChats?: Record<string, Record<string, ChatMessage[]>>
    actPerformerBindings?: Record<string, ActPerformerSessionBinding[]>
    actSessionMap?: Record<string, string>
    actSessions?: ActSessionRecord[]
}

export interface SavedStageSummary {
    id: string
    workingDir: string
    updatedAt: number
}

export interface DanceCatalogEntry {
    urn: string
    description: string
    loadMode: Exclude<DanceDeliveryMode, 'auto'>
    inlineContent?: string
}

export interface RuntimeToolResolution {
    selectedMcpServers: string[]
    requestedTools: string[]
    availableTools: string[]
    resolvedTools: string[]
    unavailableTools: string[]
    unavailableDetails: Array<{
        serverName: string
        reason: 'not_defined' | 'disabled' | 'needs_auth' | 'needs_client_registration' | 'connect_failed' | 'connected_but_no_tools_for_model'
        toolId?: string
        detail?: string
    }>
}

export interface PromptPreview {
    system: string
    agent: string
    danceCatalog: DanceCatalogEntry[]
    deliveryMode: Exclude<DanceDeliveryMode, 'auto'>
    capabilitySnapshot: ModelCapabilities | null
    toolName?: string
    toolResolution?: RuntimeToolResolution
}

export interface ChatMessageToolInfo {
    name: string
    callId: string
    status: 'pending' | 'running' | 'completed' | 'error'
    title?: string
    input?: Record<string, unknown>
    output?: string
    error?: string
    time?: { start: number; end?: number }
}

export interface ChatMessagePart {
    id: string
    type: 'text' | 'reasoning' | 'tool' | 'step-start' | 'step-finish' | 'compaction'
    content?: string
    tool?: ChatMessageToolInfo
    step?: {
        reason?: string
        cost?: number
        tokens?: { input: number; output: number; reasoning: number }
    }
    compaction?: {
        auto: boolean
        overflow?: boolean
    }
}

export interface ChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
    parts?: ChatMessagePart[]
}

export interface ActPerformerSessionBinding {
    sessionId: string
    nodeId: string
    nodeLabel: string
    performerId?: string | null
    performerName?: string | null
}

export interface FileStatus {
    path: string;
    added: number;
    removed: number;
    status: 'added' | 'deleted' | 'modified';
}

export interface SharedState {
    [key: string]: any;
}

export interface ActRunState {
    status: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted';
    currentNodeId: string | null;
    runId: string | null;
    sharedState: SharedState;
    sessions: Array<{
        scopeKey: string;
        sessionId: string;
        policy: ActSessionPolicy;
        lifetime?: ActSessionLifetime;
        nodeId?: string | null;
        performerId?: string | null;
    }>;
    sessionHandles?: Array<{
        handle: string;
        nodeId: string;
        nodeType: 'worker' | 'orchestrator';
        performerId?: string | null;
        status: 'warm';
        turnCount: number;
        lastUsedAt: number;
        summary?: string;
    }>;
    history: ActHistoryEntry[];
    finalOutput?: string;
    error?: string;
    iterations?: number;
}

export interface ActSessionRecord {
    id: string;
    actId: string;
    actName: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    status: ActRunState['status'];
    lastRunId?: string | null;
    resumeSummary?: ActThreadResumeSummary | null;
}
