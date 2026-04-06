// DOT Studio — Core Types

import type { RuntimeModelVariant } from '../../shared/model-variants'
import type { AssistantAction } from '../../shared/assistant-actions'
import type {
    ActParticipantV1 as InstalledActParticipant,
    ActRelationV1 as InstalledActRelation,
} from '../../shared/dot-types'

export type AssetKind = 'tal' | 'dance' | 'act' | 'performer' | 'model' | 'mcp'

export interface AssetCard {
    kind: AssetKind
    urn: string          // "tal/@acme/senior-engineer"
    slug?: string
    name: string         // "senior-engineer"
    author: string       // "@acme"
    description?: string
    source?: 'global' | 'stage' | 'registry' | 'draft'
    tags?: string[]
    content?: string
    draftId?: string
    draftContent?: unknown
    talUrn?: string | null
    danceUrns?: string[]
    actUrn?: string | null
    model?: ModelConfig | null
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown> | null
    declaredMcpServerNames?: string[]
    matchedMcpServerNames?: string[]
    missingMcpServerNames?: string[]
    participantCount?: number
    relationCount?: number
    participants?: InstalledActParticipant[]
    relations?: InstalledActRelation[]
    schema?: string
    stars?: number
    tier?: string
    updatedAt?: string
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
    resources?: Array<unknown>
}

export interface ModelConfig {
    provider: string     // "anthropic", "openai", "google"
    modelId: string      // "claude-sonnet-4-20250514"
    temperature?: number
    maxTokens?: number
}

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
    saveState: 'unsaved' | 'saved'
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

export interface LspServerInfo {
    name?: string
    id?: string
    status?: string
}

export interface LspDiagnosticPosition {
    line?: number
    character?: number
}

export interface LspDiagnosticRange {
    start?: LspDiagnosticPosition
    end?: LspDiagnosticPosition
}

export interface LspDiagnostic {
    severity?: number
    message: string
    source?: string
    range?: LspDiagnosticRange
}

export interface McpServer {
    name: string           // "github", "postgres", etc.
    status: 'connected' | 'disconnected' | 'disabled' | 'failed' | 'needs_auth' | 'needs_client_registration' | 'unknown'
    tools: Array<{ name: string; description?: string }>
    resources: Array<unknown>
    defined?: boolean
    configType?: 'local' | 'remote'
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
    declaredMcpConfig?: Record<string, unknown> | null
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

// Re-export choreography Act types from shared
export type {
    ActRelation,
    ActParticipantBinding,
    ParticipantSubscriptions,
    MailboxMessage,
    CallboardMessage,
    BoardEntry,
    CallboardEntry,
    MailboxEvent,
    MailboxEventType,
    CallboardEvent,
    CallboardEventType,
    WakeCondition,
    ConditionExpr,
    ActDefinition,
    MailboxState,
    CallboardState,
    ActThread,
    ActThreadStatus,
} from '../../shared/act-types'

// Local import for types used within this file
import type { ActRelation, ParticipantSubscriptions } from '../../shared/act-types'

/** Canvas-specific participant binding (extends ActParticipantBinding with UI position) */
export interface WorkspaceActParticipantBinding {
    performerRef: AssetRef
    displayName?: string
    subscriptions?: ParticipantSubscriptions
    position: { x: number; y: number }
}

export interface WorkspaceAct {
    id: string
    name: string
    description?: string
    actRules?: string[]
    /** Canvas position */
    position: { x: number; y: number }
    width: number
    height: number
    /** Participant bindings (key = internal participant key) */
    participants: Record<string, WorkspaceActParticipantBinding>
    /** Communication contract relations between participants */
    relations: ActRelation[]
    /** Runtime safety configuration */
    safety?: {
        maxEvents?: number
        maxMessagesPerPair?: number
        maxBoardUpdatesPerKey?: number
        quietWindowMs?: number
        threadTimeoutMs?: number
        loopDetectionThreshold?: number
    }
    hidden?: boolean
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

export interface SavedWorkspaceSnapshot {
    schemaVersion: 1
    workingDir: string
    performers: PerformerNode[]
    chatBindings?: Record<string, string>
    assistantModel?: { provider: string; modelId: string } | null
    appliedAssistantActionMessageIds?: Record<string, true>
    assistantActionResults?: Record<string, { applied: number; failed: number }>
    acts?: WorkspaceAct[]
    markdownEditors: MarkdownEditorNode[]
    canvasTerminals?: CanvasTerminalNode[]
    trackingWindow?: CanvasTrackingWindow | null
    hiddenFromList?: boolean
}

export interface Workspace extends SavedWorkspaceSnapshot {
    drafts: Record<string, DraftAsset>
}

export interface SavedWorkspaceSummary {
    id: string
    workingDir: string
    updatedAt: number
}

export interface DanceCatalogEntry {
    urn: string
    description: string
    loadMode: 'tool' | 'inline'
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
        reason: 'not_defined' | 'shadowed_by_project' | 'needs_auth' | 'needs_client_registration' | 'connect_failed'
        toolId?: string
        detail?: string
    }>
}

export interface PromptPreview {
    system: string
    agent: string
    danceCatalog: DanceCatalogEntry[]
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
    attachments?: Array<{ type: string; filename?: string; mime?: string }>
    metadata?: {
        agentName?: string
        modelId?: string
        provider?: string
        variant?: string
        assistantActions?: AssistantAction[]
        isWakeUp?: boolean
    }
}

export interface FileStatus {
    path: string;
    added: number;
    removed: number;
    status: 'added' | 'deleted' | 'modified';
}
