import type {
    AssetRef,
    DraftAsset,
    ExecutionMode,
    MarkdownEditorKind,
    MarkdownEditorNode,
    PerformerNode,
    PerformerLink,
    AssetCard,
    ChatMessage,
    ModelConfig,
    McpServer,
    StageAct,
    StageActEdge,
    StageActNode,
    SavedStageSummary,
    ActSessionRecord,
    CanvasTerminalNode,
    CanvasTrackingWindow,
    ActPerformerSessionBinding,
    SafeOwnerKind,
    SafeOwnerSummary,
} from '../types'
import type { AdapterViewProjection } from '../../shared/adapter-view'

export interface PerformerRelationSlice {
    edges: PerformerLink[]
    addEdge: (from: string, to: string) => void
    removeEdge: (id: string) => void
    updateEdgeDescription: (id: string, description: string) => void
}

export interface WorkspaceSlice {
    stageId: string | null
    performers: PerformerNode[]
    acts: StageAct[]
    drafts: Record<string, DraftAsset>
    markdownEditors: MarkdownEditorNode[]
    editingTarget: { type: 'performer' | 'act'; id: string } | null
    selectedPerformerId: string | null
    selectedPerformerSessionId: string | null
    selectedMarkdownEditorId: string | null
    focusedPerformerId: string | null
    focusedActId: string | null
    selectedActId: string | null
    selectedActSessionId: string | null
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

    setTerminalOpen: (open: boolean) => void
    setTrackingOpen: (open: boolean) => void
    setAssetLibraryOpen: (open: boolean) => void
    toggleTheme: () => void
    addPerformer: (name: string, x: number, y: number) => void
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
    setFocusedAct: (id: string | null) => void
    selectAct: (id: string | null) => void
    selectActSession: (id: string | null) => void
    setActThreadSession: (actId: string, sessionId: string | null) => void
    setInspectorFocus: (focus: string | null) => void
    openPerformerEditor: (id: string, focus?: string | null) => void
    openActEditor: (id: string, focus?: string | null) => void
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
    setPerformerAutoCompact: (id: string, enabled: boolean) => void
    setPerformerExecutionMode: (performerId: string, mode: ExecutionMode) => void
    toggleActVisibility: (id: string) => void
    setActExecutionMode: (actId: string, mode: ExecutionMode) => void
    addCanvasTerminal: () => void
    removeCanvasTerminal: (id: string) => void
    updateCanvasTerminalPosition: (id: string, x: number, y: number) => void
    updateCanvasTerminalSize: (id: string, width: number, height: number) => void
    updateCanvasTerminalSession: (id: string, sessionId: string | null, connected: boolean) => void
    closeTrackingWindow: () => void
    updateTrackingWindowPosition: (x: number, y: number) => void
    updateTrackingWindowSize: (width: number, height: number) => void
    upsertDraft: (draft: DraftAsset) => void
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
    addAct: (name?: string) => void
    importActFromAsset: (asset: any) => Promise<void>
    removeAct: (actId: string) => void
    updateActMeta: (actId: string, patch: Partial<Pick<StageAct, 'name' | 'description' | 'entryNodeId' | 'maxIterations'>>) => void
    updateActAuthoringMeta: (actId: string, patch: { slug?: string; description?: string; tags?: string[] }) => void
    updateActBounds: (actId: string, bounds: Partial<StageAct['bounds']>) => void
    addActNode: (actId: string) => void
    addPerformerAssetToAct: (actId: string, asset: {
        name: string
        urn?: string | null
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, any> | null
    }, position?: { x: number; y: number }) => void
    createActOwnedPerformerForNode: (actId: string, nodeId: string, asset?: {
        name?: string
        urn?: string | null
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, any> | null
    } | null) => string | null
    updateActNode: (actId: string, nodeId: string, patch: Partial<StageActNode>) => void
    updateActNodePosition: (actId: string, nodeId: string, x: number, y: number) => void
    applyActAutoLayout: (
        actId: string,
        positions: Record<string, { x: number; y: number }>,
        bounds?: Partial<StageAct['bounds']>,
    ) => void
    removeActNode: (actId: string, nodeId: string) => void
    addActEdge: (actId: string, from?: string, to?: string) => void
    updateActEdge: (actId: string, edgeId: string, patch: Partial<StageActEdge>) => void
    removeActEdge: (actId: string, edgeId: string) => void
}

export interface ChatSlice {
    chats: Record<string, ChatMessage[]>
    chatPrefixes: Record<string, ChatMessage[]>
    actChats: Record<string, ChatMessage[]>
    actPerformerChats: Record<string, Record<string, ChatMessage[]>>
    actPerformerBindings: Record<string, ActPerformerSessionBinding[]>
    activeChatPerformerId: string | null
    sessionMap: Record<string, string>
    sessionConfigMap: Record<string, string>
    actSessionMap: Record<string, string>
    loadingPerformerId: string | null
    loadingActId: string | null
    sessions: Array<{ id: string; title?: string; createdAt?: number }>
    actSessions: ActSessionRecord[]

    setActiveChatPerformer: (performerId: string | null) => void
    addChatMessage: (performerId: string, msg: ChatMessage) => void
    sendMessage: (
        performerId: string,
        message: string,
        attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
        extraDanceRefs?: AssetRef[],
        mentionedPerformers?: Array<{ performerId: string; name: string }>,
    ) => Promise<void>
    sendActMessage: (actId: string, message: string) => Promise<void>
    abortAct: (actId: string) => Promise<void>
    executeSlashCommand: (performerId: string, cmd: string) => Promise<void>
    clearSession: (performerId: string) => void
    startNewSession: (performerId: string) => Promise<void>
    startNewActSession: (actId: string) => void
    abortChat: (performerId: string) => Promise<void>
    summarizeSession: (performerId: string) => Promise<void>
    undoLastTurn: (performerId: string) => Promise<void>
    rehydrateSessions: () => Promise<void>
    forkSession: (performerId: string, messageId: string) => Promise<void>
    revertSession: (performerId: string, messageId: string) => Promise<void>
    getDiff: (performerId: string) => Promise<any[]>
    listSessions: () => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
    deleteActSession: (sessionId: string) => void
    renameActSession: (sessionId: string, title: string) => void
    detachPerformerSession: (performerId: string, notice?: string) => void
    detachActSession: (actId: string, notice?: string) => void
}

export interface IntegrationSlice {
    // Realtime integrations (OpenCode chat stream, act runtime stream, LSP diagnostics)
    lspServers: any[]
    lspDiagnostics: Record<string, any[]>

    fetchLspStatus: () => Promise<void>
    initRealtimeEvents: () => void
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

export type StudioState = PerformerRelationSlice & WorkspaceSlice & ChatSlice & IntegrationSlice & AdapterViewSlice & SafeModeSlice
