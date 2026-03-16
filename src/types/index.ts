// DOT Studio — Core Types

import type { RuntimeModelVariant } from '../../shared/model-variants'
import type {
    ExecutionMode,
    SafeOwnerKind,
    SafeOwnerFile,
    SafeOwnerSummary,
} from '../../shared/safe-mode'

export type {
    ExecutionMode,
    SafeOwnerKind,
    SafeOwnerFile,
    SafeOwnerSummary,
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

export type PerformerScope = 'shared'

export interface PerformerNode {
    id: string
    name: string
    position: { x: number; y: number }
    width?: number
    height?: number
    scope: PerformerScope
    model: ModelConfig | null
    modelPlaceholder?: ModelConfig | null
    modelVariant?: string | null
    agentId?: string | null
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    mcpServerNames: string[]
    mcpBindingMap?: Record<string, string>
    declaredMcpConfig?: Record<string, any> | null
    activeSessionId?: string
    danceDeliveryMode: DanceDeliveryMode
    executionMode?: ExecutionMode
    planMode?: boolean
    hidden?: boolean
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

/** Act-internal relation between two Act performers (Edge Attribute Model) */
export interface ActRelation {
    id: string
    from: string
    to: string
    name: string
    description: string
    invocation: 'optional' | 'required'
    await: boolean
    sessionPolicy: 'fresh' | 'reuse'
    maxCalls: number
    timeout: number
}

/** Act performer — standalone에서 복사된 독립 config (PRD §7.2) */
export interface ActPerformer {
    sourcePerformerId: string
    name: string
    position: { x: number; y: number }
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    model: ModelConfig | null
    modelVariant: string | null
    mcpServerNames: string[]
    mcpBindingMap: Record<string, string | null>
    agentId: string | null
    planMode: boolean
    danceDeliveryMode: DanceDeliveryMode
}

export interface StageAct {
    id: string
    name: string
    executionMode: ExecutionMode
    /** Canvas position */
    position: { x: number; y: number }
    width: number
    height: number
    /** 복사된 performer configs (key = internal performer id) */
    performers: Record<string, ActPerformer>
    /** Act-internal edges between performers */
    relations: ActRelation[]
    createdAt: number
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
    schemaVersion: 5
    workingDir: string
    performers: PerformerNode[]
    acts?: StageAct[]
    drafts: Record<string, DraftAsset>
    markdownEditors: MarkdownEditorNode[]
    canvasTerminals?: CanvasTerminalNode[]
    trackingWindow?: CanvasTrackingWindow | null
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
    metadata?: {
        agentName?: string
        modelId?: string
        provider?: string
        variant?: string
    }
}

export interface FileStatus {
    path: string;
    added: number;
    removed: number;
    status: 'added' | 'deleted' | 'modified';
}
