import type { StateCreator } from 'zustand'
import type { StudioState, WorkspaceSlice } from './types'
import type { DraftAsset } from '../types'
import { api, setApiWorkingDirContext } from '../api'
import {
    createPerformerNode,
    createPerformerNodeFromAsset,
    normalizePerformerAssetInput,
} from '../lib/performers'
import {
    applyPerformerPatch,
    defaultMarkdownContent,
    mapCanvasTerminals,
    mapMarkdownEditors,
    normalizePath,
} from './workspace-helpers'
import {
    newStage as newStageImpl,
    saveStage as saveStageImpl,
    loadStage as loadStageImpl,
} from './workspace-stage'
import {
    setPerformerTal as setPerformerTalImpl,
    setPerformerTalRef as setPerformerTalRefImpl,
    addPerformerDance as addPerformerDanceImpl,
    addPerformerDanceRef as addPerformerDanceRefImpl,
    replacePerformerDanceRef as replacePerformerDanceRefImpl,
    removePerformerDance as removePerformerDanceImpl,
    setPerformerModel as setPerformerModelImpl,
    setPerformerModelVariant as setPerformerModelVariantImpl,
    setPerformerAgentId as setPerformerAgentIdImpl,
    setPerformerDanceDeliveryMode as setPerformerDanceDeliveryModeImpl,
    addPerformerMcp as addPerformerMcpImpl,
    removePerformerMcp as removePerformerMcpImpl,
    setPerformerMcpBinding as setPerformerMcpBindingImpl,
    updatePerformerAuthoringMeta as updatePerformerAuthoringMetaImpl,
    togglePerformerVisibility as togglePerformerVisibilityImpl,
} from './workspace-performer-config'

export const performerIdCounter = { value: 0 }
export const markdownEditorIdCounter = { value: 0 }
export const canvasTerminalIdCounter = { value: 0 }
const TRACKING_WINDOW_ID = 'stage-tracking-window'

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// Debounce draft persistence to disk
const _draftPersistTimers = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleDraftPersist(draftId: string, fn: () => void, delay = 1500) {
    const existing = _draftPersistTimers.get(draftId)
    if (existing) clearTimeout(existing)
    _draftPersistTimers.set(draftId, setTimeout(() => {
        _draftPersistTimers.delete(draftId)
        fn()
    }, delay))
}

export const createWorkspaceSlice: StateCreator<
    StudioState,
    [],
    [],
    WorkspaceSlice
> = (set, get) => ({
    stageId: null,
    performers: [],
    drafts: {},
    markdownEditors: [],
    editingTarget: null,
    selectedPerformerId: null,
    selectedPerformerSessionId: null,
    selectedMarkdownEditorId: null,
    focusedPerformerId: null,
    focusedNodeType: null,
    focusSnapshot: null,
    inspectorFocus: null,
    stageList: [],
    stageDirty: false,
    theme: (localStorage.getItem('dot-theme') as 'light' | 'dark') || 'light',
    workingDir: '',
    isTerminalOpen: false,
    isTrackingOpen: false,
    isAssetLibraryOpen: false,
    canvasTerminals: [],
    trackingWindow: null,
    canvasCenter: null,

    setTerminalOpen: (open) => set({ isTerminalOpen: open }),
    setTrackingOpen: (open) => set((state) => {
        const created = open && !state.trackingWindow
        return {
            isTrackingOpen: open,
            trackingWindow: open
                ? (state.trackingWindow || {
                    id: TRACKING_WINDOW_ID,
                    title: 'Stage Tracking',
                    position: { x: 260, y: 180 },
                    width: 420,
                    height: 360,
                })
                : state.trackingWindow,
            stageDirty: created ? true : state.stageDirty,
        }
    }),
    setAssetLibraryOpen: (open) => set({ isAssetLibraryOpen: open }),

    toggleTheme: () => set((s) => {
        const newTheme = s.theme === 'light' ? 'dark' : 'light'
        localStorage.setItem('dot-theme', newTheme)
        api.studio.updateConfig({ theme: newTheme }).catch(err => console.warn('[studio] theme sync failed', err))
        return { theme: newTheme }
    }),

    setCanvasCenter: (x, y) => set({ canvasCenter: { x, y } }),

    addPerformer: (name, x, y) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`
        
        const finalX = x ?? get().canvasCenter?.x ?? (60 + (get().performers.length * 28))
        const finalY = y ?? get().canvasCenter?.y ?? (60 + (get().performers.length * 20))

        set((s) => ({
            performers: [...s.performers, createPerformerNode({ id, name, x: finalX, y: finalY })],
            editingTarget: null,
            selectedPerformerId: id,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            activeChatPerformerId: id,
            inspectorFocus: null,
            stageDirty: true,
        }))
    },

    addPerformerFromAsset: (asset, x, y) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`

        const finalX = x ?? get().canvasCenter?.x ?? (60 + (get().performers.length * 28))
        const finalY = y ?? get().canvasCenter?.y ?? (60 + (get().performers.length * 20))

        set((s) => ({
            performers: [...s.performers, createPerformerNodeFromAsset({ id, asset, x: finalX, y: finalY })],
            editingTarget: null,
            selectedPerformerId: id,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            activeChatPerformerId: id,
            inspectorFocus: null,
            stageDirty: true,
        }))
    },

    applyPerformerAsset: (performerId, asset) => set((s) => {
        const normalized = normalizePerformerAssetInput(asset)
        return {
            performers: s.performers.map((performer) => {
                if (performer.id !== performerId) {
                    return performer
                }
                return applyPerformerPatch(performer, {
                    talRef: normalized.talRef,
                    danceRefs: normalized.danceRefs,
                    model: normalized.model,
                    modelPlaceholder: normalized.modelPlaceholder,
                    modelVariant: null,
                    mcpServerNames: normalized.mcpServerNames,
                    mcpBindingMap: normalized.mcpBindingMap,
                    declaredMcpConfig: normalized.declaredMcpConfig,
                    meta: normalized.meta,
                })
            }),
            stageDirty: true,
        }
    }),

    removePerformer: (id) => {
        set((s) => ({
            performers: s.performers.filter(a => a.id !== id),
            selectedPerformerId: s.selectedPerformerId === id ? null : s.selectedPerformerId,
            selectedPerformerSessionId: s.selectedPerformerId === id ? null : s.selectedPerformerSessionId,
            selectedMarkdownEditorId: s.selectedMarkdownEditorId,
            editingTarget: s.editingTarget?.type === 'performer' && s.editingTarget.id === id ? null : s.editingTarget,
            stageDirty: true,
        }))
    },

    updatePerformerPosition: (id, x, y) => set((s) => ({
        performers: s.performers.map(a => a.id === id ? { ...a, position: { x, y } } : a),
        stageDirty: true
    })),

    updatePerformerSize: (id, width, height) => set((s) => ({
        performers: s.performers.map(a => a.id === id ? { ...a, width, height } : a),
        stageDirty: true
    })),

    updatePerformerName: (id, name) => set((s) => ({
        performers: s.performers.map(a => a.id === id ? applyPerformerPatch(a, { name }) : a),
        stageDirty: true,
    })),

    selectPerformer: (id) => set((s) => ({
        selectedPerformerId: id,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        // Clear act selection only when selecting a real performer (not when deselecting)
        selectedActId: id ? null : s.selectedActId,
        // Preserve focus mode when switching performers in focus mode
        focusedPerformerId: s.focusSnapshot ? s.focusedPerformerId : null,
        inspectorFocus: null,
    })),

    selectPerformerSession: (sessionId) => set({ selectedPerformerSessionId: sessionId, selectedMarkdownEditorId: null }),

    selectMarkdownEditor: (id) => set({
        selectedMarkdownEditorId: id,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        focusedPerformerId: null,
        focusedNodeType: null,
        inspectorFocus: null,
    }),

    setFocusedPerformer: (id) => set({ focusedPerformerId: id }),

    enterFocusMode: (nodeId, nodeType, viewportSize) => {
        const state = get()
        const FOCUS_PADDING = 48
        const focusWidth = viewportSize.width - FOCUS_PADDING
        const focusHeight = viewportSize.height - FOCUS_PADDING

        const focusSnapshotBase = {
            hiddenPerformerIds: state.performers.filter(p => p.hidden).map(p => p.id),
            hiddenActIds: state.acts.filter(a => (a as any).hidden).map(a => a.id),
            hiddenEditorIds: state.markdownEditors.filter(e => e.hidden).map(e => e.id),
            hiddenTerminalIds: [] as string[],
            assetLibraryOpen: state.isAssetLibraryOpen,
            assistantOpen: state.isAssistantOpen,
            terminalOpen: state.isTerminalOpen,
        }

        if (nodeType === 'performer') {
            const performer = state.performers.find(p => p.id === nodeId)
            if (!performer) return

            set({
                focusedPerformerId: nodeId,
                focusedNodeType: 'performer',
                focusSnapshot: {
                    ...focusSnapshotBase,
                    type: 'performer',
                    nodeSize: { width: performer.width ?? 400, height: performer.height ?? 500 },
                },
                selectedPerformerId: nodeId,
                selectedPerformerSessionId: state.selectedPerformerSessionId,
                activeChatPerformerId: nodeId,
                selectedActId: null,
                performers: state.performers.map(p => {
                    if (p.id === nodeId) {
                        return { ...p, hidden: false, width: focusWidth, height: focusHeight }
                    }
                    return { ...p, hidden: true }
                }),
                acts: state.acts.map(a => ({ ...a, hidden: true })),
                markdownEditors: state.markdownEditors.map(e => ({ ...e, hidden: true })),
                isAssetLibraryOpen: false,
                isAssistantOpen: false,
                isTerminalOpen: false,
                editingTarget: null,
                inspectorFocus: null,
            })
        } else {
            // Act focus
            const act = state.acts.find(a => a.id === nodeId)
            if (!act) return

            set({
                focusedPerformerId: nodeId, // reuse field for any focused node id
                focusedNodeType: 'act',
                focusSnapshot: {
                    ...focusSnapshotBase,
                    type: 'act',
                    actId: nodeId,
                    nodeSize: { width: act.width ?? 400, height: act.height ?? 420 },
                },
                selectedActId: nodeId,
                selectedPerformerId: null,
                performers: state.performers.map(p => ({ ...p, hidden: true })),
                acts: state.acts.map(a => {
                    if (a.id === nodeId) {
                        return { ...a, hidden: false, width: focusWidth, height: focusHeight }
                    }
                    return { ...a, hidden: true }
                }),
                markdownEditors: state.markdownEditors.map(e => ({ ...e, hidden: true })),
                isAssetLibraryOpen: false,
                isAssistantOpen: false,
                isTerminalOpen: false,
                editingTarget: null,
                inspectorFocus: null,
            })
        }
    },

    exitFocusMode: () => {
        const state = get()
        const snapshot = state.focusSnapshot
        if (!snapshot || !state.focusedPerformerId) return

        const focusedId = state.focusedPerformerId
        const focusedType = state.focusedNodeType || snapshot.type

        if (focusedType === 'performer') {
            set({
                focusedPerformerId: null,
                focusedNodeType: null,
                focusSnapshot: null,
                performers: state.performers.map(p => {
                    if (p.id === focusedId) {
                        return {
                            ...p,
                            width: snapshot.nodeSize.width,
                            height: snapshot.nodeSize.height,
                            hidden: snapshot.hiddenPerformerIds.includes(p.id),
                        }
                    }
                    return {
                        ...p,
                        hidden: snapshot.hiddenPerformerIds.includes(p.id),
                    }
                }),
                acts: state.acts.map(a => ({
                    ...a,
                    hidden: snapshot.hiddenActIds.includes(a.id),
                })),
                markdownEditors: state.markdownEditors.map(e => ({
                    ...e,
                    hidden: snapshot.hiddenEditorIds.includes(e.id),
                })),
                isAssetLibraryOpen: snapshot.assetLibraryOpen,
                isAssistantOpen: snapshot.assistantOpen,
                isTerminalOpen: snapshot.terminalOpen,
            })
        } else {
            // Act was focused
            set({
                focusedPerformerId: null,
                focusedNodeType: null,
                focusSnapshot: null,
                performers: state.performers.map(p => ({
                    ...p,
                    hidden: snapshot.hiddenPerformerIds.includes(p.id),
                })),
                acts: state.acts.map(a => {
                    if (a.id === focusedId) {
                        return {
                            ...a,
                            width: snapshot.nodeSize.width,
                            height: snapshot.nodeSize.height,
                            hidden: snapshot.hiddenActIds.includes(a.id),
                        }
                    }
                    return {
                        ...a,
                        hidden: snapshot.hiddenActIds.includes(a.id),
                    }
                }),
                markdownEditors: state.markdownEditors.map(e => ({
                    ...e,
                    hidden: snapshot.hiddenEditorIds.includes(e.id),
                })),
                isAssetLibraryOpen: snapshot.assetLibraryOpen,
                isAssistantOpen: snapshot.assistantOpen,
                isTerminalOpen: snapshot.terminalOpen,
            })
        }
    },

    switchFocusTarget: (nodeId, nodeType) => {
        const state = get()
        const snapshot = state.focusSnapshot
        if (!snapshot || !state.focusedPerformerId) return

        const prevId = state.focusedPerformerId
        const prevType = state.focusedNodeType || snapshot.type

        if (nodeId === prevId && nodeType === prevType) return

        // Get current focused node's expanded size for the new node
        let focusWidth = 800
        let focusHeight = 600
        if (prevType === 'performer') {
            const prev = state.performers.find(p => p.id === prevId)
            focusWidth = prev?.width || 800
            focusHeight = prev?.height || 600
        } else {
            const prev = state.acts.find(a => a.id === prevId)
            focusWidth = prev?.width || 800
            focusHeight = prev?.height || 600
        }

        if (nodeType === 'performer') {
            const nextNode = state.performers.find(p => p.id === nodeId)
            if (!nextNode) return

            set({
                focusedPerformerId: nodeId,
                focusedNodeType: 'performer',
                selectedPerformerId: nodeId,
                selectedActId: null,
                activeChatPerformerId: nodeId,
                focusSnapshot: {
                    ...snapshot,
                    type: 'performer',
                    nodeSize: { width: nextNode.width ?? 400, height: nextNode.height ?? 500 },
                },
                performers: state.performers.map(p => {
                    if (p.id === prevId && prevType === 'performer') {
                        return { ...p, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
                    }
                    if (p.id === nodeId) {
                        return { ...p, hidden: false, width: focusWidth, height: focusHeight }
                    }
                    return { ...p, hidden: true }
                }),
                acts: state.acts.map(a => {
                    if (a.id === prevId && prevType === 'act') {
                        return { ...a, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
                    }
                    return { ...a, hidden: true }
                }),
            })
        } else {
            // Switching to act
            const nextAct = state.acts.find(a => a.id === nodeId)
            if (!nextAct) return

            set({
                focusedPerformerId: nodeId,
                focusedNodeType: 'act',
                selectedActId: nodeId,
                selectedPerformerId: null,
                focusSnapshot: {
                    ...snapshot,
                    type: 'act',
                    actId: nodeId,
                    nodeSize: { width: nextAct.width ?? 400, height: nextAct.height ?? 420 },
                },
                performers: state.performers.map(p => {
                    if (p.id === prevId && prevType === 'performer') {
                        return { ...p, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
                    }
                    return { ...p, hidden: true }
                }),
                acts: state.acts.map(a => {
                    if (a.id === prevId && prevType === 'act') {
                        return { ...a, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
                    }
                    if (a.id === nodeId) {
                        return { ...a, hidden: false, width: focusWidth, height: focusHeight }
                    }
                    return { ...a, hidden: true }
                }),
            })
        }
    },

    setInspectorFocus: (focus) => set({ inspectorFocus: focus }),

    openPerformerEditor: (id, focus = null) => set({
        editingTarget: { type: 'performer', id },
        selectedPerformerId: id,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        focusedPerformerId: null,
        focusedNodeType: null,
        inspectorFocus: focus,
    }),

    closeEditor: () => set({
        editingTarget: null,
        inspectorFocus: null,
    }),

    setWorkingDir: (dir) => {
        const normalized = normalizePath(dir)
        if (!normalized) return
        setApiWorkingDirContext(normalized)
        set((s) => ({
            stageId: s.stageList.find((entry) => entry.workingDir === normalized)?.id || null,
            workingDir: normalized,
            performers: s.performers.map((performer) => ({
                ...performer,
                activeSessionId: undefined,
            })),
            drafts: {},
            markdownEditors: [],
            editingTarget: null,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            focusedPerformerId: null,
            focusedNodeType: null,
            focusSnapshot: null,
            chats: {},
            chatPrefixes: {},
            activeChatPerformerId: null,
            sessionMap: {},
            sessions: [],
            inspectorFocus: null,
            lspServers: [],
            lspDiagnostics: {},
            safeSummaries: {},
            trackingWindow: null,
            isTrackingOpen: false,
            stageDirty: true,
            acts: [],
            selectedActId: null,
            layoutActId: null,
            selectedActParticipantKey: null,
            selectedRelationId: null,
            actThreads: {},
            activeThreadId: null,
            activeThreadParticipantKey: null,
        }))
        get().initRealtimeEvents()
        api.studio.activate(normalized).catch(err => console.warn('[studio] activate failed', err))
    },

    newStage: async () => newStageImpl(get, set),

    saveStage: async () => saveStageImpl(get, set),

    loadStage: async (stageId) => loadStageImpl(stageId, get, set),

    listStages: async () => {
        try {
            const list = await api.stages.list()
            set({ stageList: list })
        } catch {
            set({ stageList: [] })
        }
    },

    deleteStage: async (stageId) => {
        if (!stageId) return
        await api.stages.delete(stageId)
        if (get().stageId === stageId) {
            set({
                stageId: null,
                selectedPerformerSessionId: null,
                selectedMarkdownEditorId: null,
                inspectorFocus: null,
                editingTarget: null,
                trackingWindow: null,
                isTrackingOpen: false,
                acts: [],
                selectedActId: null,
                layoutActId: null,
                selectedActParticipantKey: null,
                selectedRelationId: null,
                actThreads: {},
                activeThreadId: null,
                activeThreadParticipantKey: null,
            })
            api.studio.updateConfig({ lastStage: undefined }).catch(err => console.warn('[studio] clear lastStage failed', err))
        }
        get().listStages()
    },

    setPerformerTal: (performerId, tal) => setPerformerTalImpl(set, performerId, tal),

    setPerformerTalRef: (performerId, talRef) => setPerformerTalRefImpl(set, performerId, talRef),

    addPerformerDance: (performerId, dance) => addPerformerDanceImpl(set, performerId, dance),

    addPerformerDanceRef: (performerId, danceRef) => addPerformerDanceRefImpl(set, performerId, danceRef),

    replacePerformerDanceRef: (performerId, currentRef, nextRef) => replacePerformerDanceRefImpl(set, performerId, currentRef, nextRef),

    removePerformerDance: (performerId, danceUrn) => removePerformerDanceImpl(set, performerId, danceUrn),

    setPerformerModel: (performerId, model) => setPerformerModelImpl(set, performerId, model),

    setPerformerModelVariant: (performerId, modelVariant) => setPerformerModelVariantImpl(set, performerId, modelVariant),

    setPerformerAgentId: (performerId, agentId) => setPerformerAgentIdImpl(set, performerId, agentId),

    setPerformerDanceDeliveryMode: (performerId, danceDeliveryMode) => setPerformerDanceDeliveryModeImpl(set, performerId, danceDeliveryMode),

    addPerformerMcp: (performerId, mcp) => addPerformerMcpImpl(set, performerId, mcp),

    removePerformerMcp: (performerId, mcpName) => removePerformerMcpImpl(set, performerId, mcpName),

    setPerformerMcpBinding: (performerId, placeholderName, serverName) => setPerformerMcpBindingImpl(set, performerId, placeholderName, serverName),

    updatePerformerAuthoringMeta: (performerId, patch) => updatePerformerAuthoringMetaImpl(set, performerId, patch),

    togglePerformerVisibility: (id) => togglePerformerVisibilityImpl(set, id),


    setPerformerExecutionMode: (performerId, mode) => {
        set((state) => ({
            performers: state.performers.map((performer) => (
                performer.id === performerId
                    ? { ...performer, executionMode: mode }
                    : performer
            )),
            stageDirty: true,
        }))
        get().clearSafeOwner('performer', performerId)
        get().detachPerformerSession(
            performerId,
            mode === 'safe'
                ? 'Switched to Safe mode. The next turn will start a new thread lineage in the safe workspace.'
                : 'Switched to Direct mode. The next turn will start a new thread lineage in the project workspace.',
        )
    },


    addCanvasTerminal: () => {
        canvasTerminalIdCounter.value++
        const id = `canvas-term-${canvasTerminalIdCounter.value}`
        const title = `Terminal ${canvasTerminalIdCounter.value}`
        set((s) => ({
            canvasTerminals: [
                ...s.canvasTerminals,
                {
                    id,
                    title,
                    position: {
                        x: 200 + (s.canvasTerminals.length * 30),
                        y: 200 + (s.canvasTerminals.length * 20),
                    },
                    width: 600,
                    height: 400,
                    sessionId: null,
                    connected: false,
                },
            ],
            stageDirty: true,
        }))
    },

    removeCanvasTerminal: (id) => set((s) => ({
        canvasTerminals: s.canvasTerminals.filter(t => t.id !== id),
        stageDirty: true,
    })),

    updateCanvasTerminalPosition: (id, x, y) => set((s) => ({
        canvasTerminals: mapCanvasTerminals(s.canvasTerminals, id, (terminal) => ({ ...terminal, position: { x, y } })),
        stageDirty: true,
    })),

    updateCanvasTerminalSize: (id, width, height) => set((s) => ({
        canvasTerminals: mapCanvasTerminals(s.canvasTerminals, id, (terminal) => ({ ...terminal, width, height })),
        stageDirty: true,
    })),

    updateCanvasTerminalSession: (id, sessionId, connected) => set((s) => ({
        canvasTerminals: mapCanvasTerminals(s.canvasTerminals, id, (terminal) => ({ ...terminal, sessionId, connected })),
    })),

    closeTrackingWindow: () => set({
        isTrackingOpen: false,
        trackingWindow: null,
        stageDirty: true,
    }),

    updateTrackingWindowPosition: (x, y) => set((s) => ({
        trackingWindow: s.trackingWindow
            ? {
                ...s.trackingWindow,
                position: { x, y },
            }
            : s.trackingWindow,
        stageDirty: true,
    })),

    updateTrackingWindowSize: (width, height) => set((s) => ({
        trackingWindow: s.trackingWindow
            ? {
                ...s.trackingWindow,
                width,
                height,
            }
            : s.trackingWindow,
        stageDirty: true,
    })),

    upsertDraft: (draft) => {
        set((s) => ({
            drafts: {
                ...s.drafts,
                [draft.id]: draft,
            },
            stageDirty: true,
        }))

        // Debounced persist to disk
        scheduleDraftPersist(draft.id, () => {
            const current = get().drafts[draft.id]
            if (!current) return
            const kind = current.kind as 'tal' | 'dance' | 'performer' | 'act'
            api.drafts.update(kind, draft.id, {
                name: current.name,
                content: current.content,
                slug: current.slug,
                description: current.description,
                tags: current.tags,
                derivedFrom: current.derivedFrom,
            }).catch((err) => {
                // Draft may not exist on disk yet — create it
                api.drafts.create({
                    kind,
                    name: current.name,
                    content: current.content,
                    slug: current.slug,
                    description: current.description,
                    tags: current.tags,
                    derivedFrom: current.derivedFrom,
                }).catch(() => {
                    console.warn('Failed to persist draft to disk', err)
                })
            })
        })
    },

    savePerformerAsDraft: async (performerId) => {
        const performer = get().performers.find((p) => p.id === performerId)
        if (!performer) return

        const draftContent = {
            talRef: performer.talRef || null,
            danceRefs: performer.danceRefs || [],
            model: performer.model || null,
            modelVariant: performer.modelVariant || null,
            mcpServerNames: performer.mcpServerNames || [],
            mcpBindingMap: performer.mcpBindingMap || {},
            danceDeliveryMode: performer.danceDeliveryMode || 'auto',
            planMode: performer.planMode || false,
            agentId: performer.agentId || null,
        }

        try {
            const draft = await api.drafts.create({
                kind: 'performer',
                name: performer.name,
                content: draftContent,
                description: performer.name,
            })

            set((s) => ({
                drafts: {
                    ...s.drafts,
                    [draft.id]: {
                        id: draft.id,
                        kind: 'performer' as const,
                        name: draft.name,
                        content: draft.content,
                        description: draft.description,
                        updatedAt: draft.updatedAt,
                    },
                },
                stageDirty: true,
            }))
        } catch (err) {
            console.error('Failed to save performer as draft', err)
        }
    },

    loadDraftsFromDisk: async () => {
        try {
            const drafts = await api.drafts.list()
            const draftsMap: Record<string, DraftAsset> = {}
            for (const draft of drafts) {
                draftsMap[draft.id] = {
                    id: draft.id,
                    kind: draft.kind,
                    name: draft.name,
                    content: draft.content,
                    slug: draft.slug,
                    description: draft.description,
                    tags: draft.tags,
                    derivedFrom: draft.derivedFrom,
                    updatedAt: draft.updatedAt || Date.now(),
                }
            }
            set({ drafts: draftsMap })
        } catch (err) {
            console.warn('Failed to load drafts from disk', err)
        }
    },

    saveActAsDraft: async (actId) => {
        const act = get().acts.find((a) => a.id === actId)
        if (!act) return

        const draftContent = {
            description: act.description,
            actRules: act.actRules,
            participants: Object.fromEntries(
                Object.entries(act.participants).map(([key, p]) => [key, {
                    performerRef: p.performerRef,
                    activeDanceIds: p.activeDanceIds,
                    subscriptions: p.subscriptions,
                }]),
            ),
            relations: act.relations.map((r) => ({
                id: r.id,
                between: r.between,
                direction: r.direction,
                name: r.name,
                description: r.description,
                permissions: r.permissions,
                maxCalls: r.maxCalls,
                timeout: r.timeout,
            })),
        }

        try {
            const draft = await api.drafts.create({
                kind: 'act',
                name: act.name,
                content: draftContent,
                description: act.meta?.authoring?.description || act.name,
            })

            set((s) => ({
                drafts: {
                    ...s.drafts,
                    [draft.id]: {
                        id: draft.id,
                        kind: 'act' as const,
                        name: draft.name,
                        content: draft.content,
                        description: draft.description,
                        updatedAt: draft.updatedAt,
                    },
                },
                stageDirty: true,
            }))
        } catch (err) {
            console.error('Failed to save act as draft', err)
        }
    },

    addPerformerFromDraft: (name, draftContent) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`
        const finalX = get().canvasCenter?.x ?? (60 + (get().performers.length * 28))
        const finalY = get().canvasCenter?.y ?? (60 + (get().performers.length * 20))

        const node = createPerformerNode({
            id,
            name,
            x: finalX,
            y: finalY,
            talRef: draftContent.talRef || null,
            danceRefs: draftContent.danceRefs || [],
            model: draftContent.model || null,
            modelVariant: draftContent.modelVariant || null,
            mcpServerNames: draftContent.mcpServerNames || [],
            mcpBindingMap: draftContent.mcpBindingMap || {},
            danceDeliveryMode: draftContent.danceDeliveryMode || 'auto',
            planMode: draftContent.planMode || false,
        })

        set((s) => ({
            performers: [...s.performers, node],
            editingTarget: null,
            selectedPerformerId: id,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            activeChatPerformerId: id,
            inspectorFocus: null,
            stageDirty: true,
        }))
    },

    importActFromDraft: (name, draftContent) => {
        const actId = makeId('act')
        const centerX = get().canvasCenter?.x ?? 200
        const centerY = get().canvasCenter?.y ?? 200

        // Build participant bindings from draft content (choreography model)
        const participants: Record<string, any> = {}
        if (draftContent.participants && typeof draftContent.participants === 'object') {
            let idx = 0
            for (const [key, p] of Object.entries(draftContent.participants) as [string, any][]) {
                participants[key] = {
                    performerRef: p.performerRef || { kind: 'draft', draftId: '' },
                    activeDanceIds: p.activeDanceIds,
                    subscriptions: p.subscriptions,
                    position: p.position || { x: centerX + idx * 300, y: centerY },
                }
                idx++
            }
        }

        const newAct = {
            id: actId,
            name,
            description: draftContent.description,
            actRules: draftContent.actRules,
            position: { x: centerX, y: centerY },
            width: 340,
            height: 80,
            participants,
            relations: Array.isArray(draftContent.relations) ? draftContent.relations : [],
            createdAt: Date.now(),
        }

        set((s) => ({
            acts: [...s.acts, newAct],
            selectedActId: actId,
            stageDirty: true,
        }))
    },

    createMarkdownEditor: (kind, options) => {
        markdownEditorIdCounter.value++
        const editorId = `markdown-editor-${markdownEditorIdCounter.value}`
        const draftId = makeId(`${kind}-draft`)
        const source = options?.source
        const name = source?.name || (kind === 'tal' ? 'New Tal' : 'New Dance')
        const slug = source?.slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const description = source?.description || name
        const tags = source?.tags || []
        const content = source?.content || defaultMarkdownContent(kind)
        const position = options?.position || {
            x: 160 + (get().markdownEditors.length * 28),
            y: 140 + (get().markdownEditors.length * 24),
        }

        set((s) => ({
            drafts: {
                ...s.drafts,
                [draftId]: {
                    id: draftId,
                    kind,
                    name,
                    slug,
                    description,
                    tags,
                    content,
                    derivedFrom: source?.derivedFrom || undefined,
                    updatedAt: Date.now(),
                },
            },
            markdownEditors: [
                ...s.markdownEditors,
                {
                    id: editorId,
                    kind,
                    position,
                    width: 560,
                    height: 380,
                    draftId,
                    baseline: source ? {
                        name,
                        slug,
                        description,
                        tags,
                        content,
                    } : null,
                    attachTarget: options?.attachTarget || null,
                    hidden: false,
                },
            ],
            selectedMarkdownEditorId: editorId,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            focusedPerformerId: null,
            focusedNodeType: null,
            inspectorFocus: null,
            stageDirty: true,
        }))

        // Persist draft to disk (fire-and-forget, pass draftId for ID consistency)
        api.drafts.create({
            kind,
            id: draftId,
            name,
            content,
            slug,
            description,
            tags,
            derivedFrom: source?.derivedFrom || null,
        }).catch((err) => {
            console.warn('Failed to persist new editor draft to disk', err)
        })

        return editorId
    },

    updateMarkdownEditorPosition: (id, x, y) => set((s) => ({
        markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, position: { x, y } })),
        stageDirty: true,
    })),

    updateMarkdownEditorSize: (id, width, height) => set((s) => ({
        markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, width, height })),
        stageDirty: true,
    })),

    updateMarkdownEditorBaseline: (id, baseline) => set((s) => ({
        markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, baseline })),
        stageDirty: true,
    })),

    removeMarkdownEditor: (id) => set((s) => ({
        markdownEditors: s.markdownEditors.filter((editor) => editor.id !== id),
        selectedMarkdownEditorId: s.selectedMarkdownEditorId === id ? null : s.selectedMarkdownEditorId,
        stageDirty: true,
    })),

})
