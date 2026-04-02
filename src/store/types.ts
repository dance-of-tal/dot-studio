import type {
    AssetRef,
    DraftAsset,
    LspDiagnostic,
    LspServerInfo,
    MarkdownEditorKind,
    MarkdownEditorNode,
    PerformerNode,
    AssetCard,
    ChatMessage,
    ModelConfig,
    McpServer,
    SavedWorkspaceSummary,
    CanvasTerminalNode,
    CanvasTrackingWindow,
    WorkspaceAct,
    WorkspaceActParticipantBinding,
    ActRelation,
} from '../types'
import type { AdapterViewProjection } from '../../shared/adapter-view'
import type { QuestionAnswer } from '@opencode-ai/sdk/v2'
import type { SessionSlice } from './session/types'
import type { ProjectionDirtyState, RuntimeChangeClass, StudioChangeDescriptor } from './runtime-change-policy'

export type PerformerRelationSlice = Record<never, never>

export interface FocusSnapshot {
    nodeId: string
    type: 'performer' | 'act'
    actId?: string
    nodePosition?: { x: number; y: number }
    hiddenPerformerIds: string[]
    hiddenActIds: string[]
    hiddenEditorIds: string[]
    hiddenTerminalIds: string[]
    nodeSize: { width: number; height: number }
    assetLibraryOpen: boolean
    assistantOpen: boolean
    terminalOpen: boolean
}

export interface CanvasRevealTarget {
    id: string
    type: 'performer' | 'act'
    nonce: number
}

export interface WorkspaceSlice {
    workspaceId: string | null
    performers: PerformerNode[]
    drafts: Record<string, DraftAsset>
    markdownEditors: MarkdownEditorNode[]
    editingTarget: { type: 'performer'; id: string } | null
    selectedPerformerId: string | null
    selectedPerformerSessionId: string | null
    selectedMarkdownEditorId: string | null
    focusedPerformerId: string | null
    focusedNodeType: 'performer' | 'act' | null
    focusSnapshot: FocusSnapshot | null
    canvasRevealTarget: CanvasRevealTarget | null
    inspectorFocus: string | null
    workspaceList: SavedWorkspaceSummary[]
    workspaceDirty: boolean
    projectionDirty: ProjectionDirtyState
    runtimeReloadPending: boolean
    theme: 'light' | 'dark'
    workingDir: string
    isTerminalOpen: boolean
    isTrackingOpen: boolean
    isAssetLibraryOpen: boolean
    canvasTerminals: CanvasTerminalNode[]
    trackingWindow: CanvasTrackingWindow | null
    canvasCenter: { x: number; y: number } | null
    layoutActId: string | null

    setTerminalOpen: (open: boolean) => void
    setTrackingOpen: (open: boolean) => void
    setAssetLibraryOpen: (open: boolean) => void
    toggleTheme: () => void
    setCanvasCenter: (x: number, y: number) => void
    addPerformer: (name: string, x?: number, y?: number) => string
    addPerformerFromAsset: (asset: {
        name: string
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelVariant?: string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, unknown> | null
    }, x?: number, y?: number) => void
    applyPerformerAsset: (performerId: string, asset: {
        name: string
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelVariant?: string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, unknown> | null
    }) => void
    removePerformer: (id: string) => void
    updatePerformerPosition: (id: string, x: number, y: number) => void
    updatePerformerSize: (id: string, width: number, height: number) => void
    updatePerformerName: (id: string, name: string) => void
    selectPerformer: (id: string | null) => void
    selectPerformerSession: (sessionId: string | null) => void
    selectMarkdownEditor: (id: string | null) => void
    setFocusedPerformer: (id: string | null) => void
    enterFocusMode: (nodeId: string, nodeType: 'performer' | 'act', viewportSize: { width: number; height: number }) => void
    exitFocusMode: () => void
    switchFocusTarget: (nodeId: string, nodeType: 'performer' | 'act') => void
    revealCanvasNode: (nodeId: string, nodeType: 'performer' | 'act') => void
    exitActLayoutMode: () => void
    setInspectorFocus: (focus: string | null) => void
    openPerformerEditor: (id: string, focus?: string | null) => void
    closeEditor: () => void
    setWorkingDir: (dir: string) => void
    newWorkspace: () => Promise<void>
    closeWorkspace: () => Promise<void>
    saveWorkspace: () => Promise<void>
    loadWorkspace: (workspaceId: string) => Promise<void>
    listWorkspaces: () => Promise<void>
    deleteWorkspace: (workspaceId: string) => Promise<void>
    markProjectionDirty: (patch: Partial<ProjectionDirtyState>) => void
    clearProjectionDirty: (patch?: Partial<ProjectionDirtyState>) => void
    recordStudioChange: (change: StudioChangeDescriptor) => RuntimeChangeClass
    markRuntimeReloadPending: () => void
    clearRuntimeReloadPending: () => void
    applyPendingRuntimeReload: () => Promise<boolean>

    setPerformerTal: (performerId: string, tal: AssetCard | null) => void
    setPerformerTalRef: (performerId: string, talRef: AssetRef | null) => void
    addPerformerDance: (performerId: string, dance: AssetCard) => void
    addPerformerDanceRef: (performerId: string, danceRef: AssetRef) => void
    replacePerformerDanceRef: (performerId: string, currentRef: AssetRef, nextRef: AssetRef) => void
    removePerformerDance: (performerId: string, danceUrn: string) => void
    setPerformerModel: (performerId: string, model: ModelConfig | null) => void
    setPerformerModelVariant: (performerId: string, variant: string | null) => void
    setPerformerAgentId: (performerId: string, agentId: string | null) => void
    setPerformerDanceDeliveryMode: (performerId: string, mode: 'auto' | 'tool' | 'inline') => void
    addPerformerMcp: (performerId: string, mcp: McpServer) => void
    removePerformerMcp: (performerId: string, mcpName: string) => void
    setPerformerMcpBinding: (performerId: string, placeholderName: string, serverName: string | null) => void
    updatePerformerAuthoringMeta: (performerId: string, patch: { slug?: string; description?: string; tags?: string[] }) => void
    togglePerformerVisibility: (id: string) => void
    addCanvasTerminal: () => void
    removeCanvasTerminal: (id: string) => void
    updateCanvasTerminalPosition: (id: string, x: number, y: number) => void
    updateCanvasTerminalSize: (id: string, width: number, height: number) => void
    updateCanvasTerminalSession: (id: string, sessionId: string | null, connected: boolean) => void
    closeTrackingWindow: () => void
    updateTrackingWindowPosition: (x: number, y: number) => void
    updateTrackingWindowSize: (width: number, height: number) => void
    upsertDraft: (draft: DraftAsset) => void
    savePerformerAsDraft: (performerId: string) => Promise<void>
    saveActAsDraft: (actId: string) => Promise<void>
    loadDraftsFromDisk: () => Promise<void>
    addPerformerFromDraft: (name: string, draftContent: Record<string, unknown>, description?: string) => void
    importActFromDraft: (name: string, draftContent: Record<string, unknown>) => void
    createMarkdownEditor: (
        kind: MarkdownEditorKind,
        options?: {
            source?: {
                name: string
                slug?: string
                description?: string
                tags?: string[]
                content: string
                derivedFrom?: string | null
            }
            attachTarget?: MarkdownEditorNode['attachTarget']
            position?: { x: number; y: number }
        },
    ) => string
    saveMarkdownDraft: (editorId: string) => Promise<DraftAsset>
    updateMarkdownEditorPosition: (id: string, x: number, y: number) => void
    updateMarkdownEditorSize: (id: string, width: number, height: number) => void
    updateMarkdownEditorBaseline: (id: string, baseline: MarkdownEditorNode['baseline']) => void
    removeMarkdownEditor: (id: string) => void
    openDraftEditor: (draftId: string) => string | null
}

export interface ChatSlice {
    activeChatPerformerId: string | null
    sessions: Array<{ id: string; title?: string; createdAt?: number }>

    setActiveChatPerformer: (performerId: string | null) => void
    addChatMessage: (performerId: string, msg: ChatMessage) => void
    sendMessage: (
        performerId: string,
        message: string,
        attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
        extraDanceRefs?: AssetRef[],
    ) => Promise<void>
    sendActMessage: (
        actId: string,
        threadId: string,
        participantKey: string,
        message: string,
    ) => Promise<void>
    executeSlashCommand: (performerId: string, cmd: string) => Promise<void>
    clearSession: (performerId: string) => void
    startNewSession: (performerId: string) => Promise<void>
    abortChat: (performerId: string) => Promise<void>
    undoLastTurn: (performerId: string) => Promise<void>
    rehydrateSessions: () => Promise<void>
    revertSession: (performerId: string, messageId: string) => Promise<void>
    restoreRevertedMessage: (performerId: string, messageId: string) => Promise<void>
    getDiff: (performerId: string) => Promise<Array<Record<string, unknown>>>
    listSessions: () => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
    detachPerformerSession: (performerId: string, notice?: string) => void

    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: QuestionAnswer[]) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
}

export interface IntegrationSlice {
    // Realtime integrations (OpenCode chat stream, LSP diagnostics)
    lspServers: LspServerInfo[]
    lspDiagnostics: Record<string, LspDiagnostic[]>

    fetchLspStatus: () => Promise<void>
    initRealtimeEvents: () => void
    forceReconnectRealtimeEvents: () => void
    cleanupRealtimeEvents: () => void

    // Compile Prompt (imperative, used by chat)
    compilePrompt: (performerId: string) => Promise<string>
}

export interface AdapterViewSlice {
    adapterViewsByPerformer: Record<string, Record<string, AdapterViewProjection>>
    upsertAdapterViewProjection: (projection: AdapterViewProjection) => void
    clearAdapterViewsForPerformer: (performerId: string) => void
}

export interface ActThreadState {
    id: string
    actId: string
    name?: string  // client-side display name
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    participantSessions: Record<string, string>  // participantKey → sessionId
    createdAt: number
}

export interface ActEditorState {
    actId: string
    mode: 'act' | 'participant' | 'relation'
    participantKey: string | null
    relationId: string | null
}

export interface ActSlice {
    acts: WorkspaceAct[]
    selectedActId: string | null
    actEditorState: ActEditorState | null

    // ── Act Thread state ────────────────────────
    actThreads: Record<string, ActThreadState[]>  // actId → threads
    activeThreadId: string | null
    activeThreadParticipantKey: string | null

    // ── Act Definition CRUD ─────────────────────
    addAct: (name: string) => string
    removeAct: (id: string) => void
    renameAct: (id: string, name: string) => void
    updateActDescription: (id: string, description: string) => void
    updateActRules: (id: string, rules: string[]) => void
    updateActSafety: (id: string, safety: WorkspaceAct['safety']) => void
    selectAct: (id: string | null) => void
    toggleActVisibility: (id: string) => void

    // ── Participant Binding (ref-based) ─────────
    bindPerformerToAct: (actId: string, performerRef: WorkspaceActParticipantBinding['performerRef']) => string
    attachPerformerRefToAct: (actId: string, performerRef: WorkspaceActParticipantBinding['performerRef']) => string | null
    attachPerformerToAct: (actId: string, performerId: string) => string | null
    autoLayoutActParticipants: (actId: string) => void
    unbindPerformerFromAct: (actId: string, participantKey: string) => void
    updatePerformerBinding: (actId: string, participantKey: string, update: Partial<WorkspaceActParticipantBinding>) => void
    openActEditor: (
        actId: string,
        mode?: ActEditorState['mode'],
        options?: { participantKey?: string | null; relationId?: string | null }
    ) => void
    closeActEditor: () => void
    openActParticipantEditor: (actId: string, participantKey: string) => void
    openActRelationEditor: (actId: string, relationId: string) => void
    updateActParticipantPosition: (actId: string, participantKey: string, x: number, y: number) => void

    // ── Relation (communication contract) ───────
    addRelation: (actId: string, between: [string, string], direction: 'both' | 'one-way') => string | null
    removeRelation: (actId: string, relationId: string) => void
    updateRelation: (actId: string, relationId: string, update: Partial<ActRelation>) => void

    // ── Canvas ──────────────────────────────────
    updateActPosition: (id: string, x: number, y: number) => void
    updateActSize: (id: string, width: number, height: number) => void

    // ── Authoring / import ──────────────────────
    updateActAuthoringMeta: (id: string, meta: WorkspaceAct['meta']) => void
    importActFromAsset: (asset: AssetCard) => void

    // ── Thread management ───────────────────────
    createThread: (actId: string) => Promise<string>
    selectThread: (actId: string, threadId: string | null) => void
    selectThreadParticipant: (participantKey: string | null) => void
    loadThreads: (actId: string) => Promise<void>
    deleteThread: (actId: string, threadId: string) => Promise<void>
    renameThread: (actId: string, threadId: string, name: string) => void
}


export interface AssistantSlice {
    isAssistantOpen: boolean
    assistantModel: { provider: string; modelId: string } | null
    assistantAvailableModels: Array<{ provider: string; providerName: string; modelId: string; name: string }>
    appliedAssistantActionMessageIds: Record<string, true>
    assistantActionResults: Record<string, { applied: number; failed: number }>

    toggleAssistant: () => void
    setAssistantModel: (model: { provider: string; modelId: string } | null) => void
    setAssistantAvailableModels: (models: Array<{ provider: string; providerName: string; modelId: string; name: string }>) => void
    markAssistantActionsApplied: (messageId: string) => void
    recordAssistantActionResult: (messageId: string, result: { applied: number; failed: number }) => void
    resetAssistantRuntimeState: () => void
}

export type StudioState = PerformerRelationSlice & WorkspaceSlice & ChatSlice & IntegrationSlice & AdapterViewSlice & ActSlice & AssistantSlice & SessionSlice
