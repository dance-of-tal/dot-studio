import type {
    AssetRef,
    DraftAsset,
    ExecutionMode,
    MarkdownEditorKind,
    MarkdownEditorNode,
    PerformerNode,
    AssetCard,
    ChatMessage,
    ModelConfig,
    McpServer,
    SavedStageSummary,
    CanvasTerminalNode,
    CanvasTrackingWindow,
    SafeOwnerKind,
    SafeOwnerSummary,
    StageAct,
    StageActParticipantBinding,
    ActRelation,
} from '../types'
import type { AdapterViewProjection } from '../../shared/adapter-view'
import type { PermissionRequest, QuestionRequest, Todo } from '@opencode-ai/sdk/v2'

export interface PerformerRelationSlice {
    // Stand-alone edges removed — edges live inside Act.relations
}

export interface FocusSnapshot {
    type: 'performer' | 'act'
    actId?: string
    hiddenPerformerIds: string[]
    hiddenActIds: string[]
    hiddenEditorIds: string[]
    hiddenTerminalIds: string[]
    nodeSize: { width: number; height: number }
    assetLibraryOpen: boolean
    assistantOpen: boolean
    terminalOpen: boolean
}

export interface WorkspaceSlice {
    stageId: string | null
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
    inspectorFocus: string | null
    stageList: SavedStageSummary[]
    stageDirty: boolean
    theme: 'light' | 'dark'
    workingDir: string
    isTerminalOpen: boolean
    isTrackingOpen: boolean
    isAssetLibraryOpen: boolean
    canvasTerminals: CanvasTerminalNode[]
    trackingWindow: CanvasTrackingWindow | null
    canvasCenter: { x: number; y: number } | null

    setTerminalOpen: (open: boolean) => void
    setTrackingOpen: (open: boolean) => void
    setAssetLibraryOpen: (open: boolean) => void
    toggleTheme: () => void
    setCanvasCenter: (x: number, y: number) => void
    addPerformer: (name: string, x?: number, y?: number) => void
    addPerformerFromAsset: (asset: {
        name: string
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, any> | null
    }, x?: number, y?: number) => void
    applyPerformerAsset: (performerId: string, asset: {
        name: string
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, any> | null
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
    setInspectorFocus: (focus: string | null) => void
    openPerformerEditor: (id: string, focus?: string | null) => void
    closeEditor: () => void
    setWorkingDir: (dir: string) => void
    newStage: () => Promise<void>
    saveStage: () => Promise<void>
    loadStage: (stageId: string) => Promise<void>
    listStages: () => Promise<void>
    deleteStage: (stageId: string) => Promise<void>

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
    setPerformerExecutionMode: (performerId: string, mode: ExecutionMode) => void
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
    addPerformerFromDraft: (name: string, draftContent: Record<string, any>) => void
    importActFromDraft: (name: string, draftContent: Record<string, any>) => void
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
    updateMarkdownEditorPosition: (id: string, x: number, y: number) => void
    updateMarkdownEditorSize: (id: string, width: number, height: number) => void
    updateMarkdownEditorBaseline: (id: string, baseline: MarkdownEditorNode['baseline']) => void
    removeMarkdownEditor: (id: string) => void
}

export interface ChatSlice {
    chats: Record<string, ChatMessage[]>
    chatPrefixes: Record<string, ChatMessage[]>
    activeChatPerformerId: string | null
    sessionMap: Record<string, string>
    loadingPerformerId: string | null
    sessions: Array<{ id: string; title?: string; createdAt?: number }>
    pendingPermissions: Record<string, PermissionRequest>
    pendingQuestions: Record<string, QuestionRequest>
    todos: Record<string, Todo[]>

    setActiveChatPerformer: (performerId: string | null) => void
    addChatMessage: (performerId: string, msg: ChatMessage) => void
    sendMessage: (
        performerId: string,
        message: string,
        attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
        extraDanceRefs?: AssetRef[],
        mentionedPerformers?: Array<{ performerId: string; name: string }>,
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
    getDiff: (performerId: string) => Promise<any[]>
    listSessions: () => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
    detachPerformerSession: (performerId: string, notice?: string) => void
    
    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: Record<string, string[]>) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
}

export interface IntegrationSlice {
    // Realtime integrations (OpenCode chat stream, LSP diagnostics)
    lspServers: any[]
    lspDiagnostics: Record<string, any[]>

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

export interface SafeModeSlice {
    safeSummaries: Record<string, SafeOwnerSummary>
    refreshSafeOwner: (ownerKind: SafeOwnerKind, ownerId: string) => Promise<SafeOwnerSummary | null>
    clearSafeOwner: (ownerKind: SafeOwnerKind, ownerId: string) => void
    applySafeOwner: (ownerKind: SafeOwnerKind, ownerId: string) => Promise<void>
    discardSafeOwnerFile: (ownerKind: SafeOwnerKind, ownerId: string, filePath: string) => Promise<void>
    discardAllSafeOwner: (ownerKind: SafeOwnerKind, ownerId: string) => Promise<void>
    undoLastSafeApply: (ownerKind: SafeOwnerKind, ownerId: string) => Promise<void>
}

export interface ActThreadState {
    id: string
    actId: string
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    participantSessions: Record<string, string>  // participantKey → sessionId
    createdAt: number
}

export interface ActSlice {
    acts: StageAct[]
    selectedActId: string | null

    selectedActParticipantKey: string | null
    selectedRelationId: string | null

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
    selectAct: (id: string | null) => void
    toggleActVisibility: (id: string) => void

    // ── Participant Binding (ref-based) ─────────
    bindPerformerToAct: (actId: string, performerRef: StageActParticipantBinding['performerRef']) => string
    attachPerformerRefToAct: (actId: string, performerRef: StageActParticipantBinding['performerRef']) => string | null
    createActFromPerformers: (performerIds: [string, string], options?: { name?: string }) => string | null
    attachPerformerToAct: (actId: string, performerId: string) => string | null
    autoLayoutActParticipants: (actId: string) => void
    unbindPerformerFromAct: (actId: string, participantKey: string) => void
    updatePerformerBinding: (actId: string, participantKey: string, update: Partial<StageActParticipantBinding>) => void
    selectActParticipant: (key: string | null) => void
    updateActParticipantPosition: (actId: string, participantKey: string, x: number, y: number) => void

    // ── Relation (communication contract) ───────
    addRelation: (actId: string, between: [string, string], direction: 'both' | 'one-way') => string | null
    removeRelation: (actId: string, relationId: string) => void
    updateRelation: (actId: string, relationId: string, update: Partial<ActRelation>) => void
    selectRelation: (id: string | null) => void

    // ── Canvas ──────────────────────────────────
    updateActPosition: (id: string, x: number, y: number) => void
    updateActSize: (id: string, width: number, height: number) => void

    // ── Authoring / import ──────────────────────
    updateActAuthoringMeta: (id: string, meta: StageAct['meta']) => void
    importActFromAsset: (asset: any) => void

    // ── Thread management ───────────────────────
    createThread: (actId: string) => Promise<string>
    selectThread: (threadId: string | null) => void
    selectThreadParticipant: (participantKey: string | null) => void
    loadThreads: (actId: string) => Promise<void>
}


export interface AssistantSlice {
    isAssistantOpen: boolean

    toggleAssistant: () => void
    /** Ensure the hidden 'studio-assistant' performer node exists with the given model */
    ensureAssistantPerformer: (model: { provider: string; modelId: string }) => void
}

export type StudioState = PerformerRelationSlice & WorkspaceSlice & ChatSlice & IntegrationSlice & AdapterViewSlice & SafeModeSlice & ActSlice & AssistantSlice
