import type { StateCreator } from 'zustand'
import type { StudioState, WorkspaceSlice } from './types'
import { api } from '../api'
import {
    createPerformerNode,
    createPerformerNodeFromAsset,
    normalizePerformerAssetInput,
} from '../lib/performers'
import {
    applyPerformerPatch,
    mapMarkdownEditors,
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
import {
    addPerformerFromDraftImpl,
    createMarkdownEditorImpl,
    importActFromDraftImpl,
    loadDraftsFromDiskImpl,
    saveActAsDraftImpl,
    savePerformerAsDraftImpl,
    upsertDraftImpl,
} from './workspace-draft-actions'
import {
    addCanvasTerminalImpl,
    closeTrackingWindowImpl,
    enterFocusModeImpl,
    exitFocusModeImpl,
    removeCanvasTerminalImpl,
    setWorkingDirImpl,
    switchFocusTargetImpl,
    updateCanvasTerminalPositionImpl,
    updateCanvasTerminalSessionImpl,
    updateCanvasTerminalSizeImpl,
    updateTrackingWindowPositionImpl,
    updateTrackingWindowSizeImpl,
} from './workspace-focus-actions'

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
    layoutActId: null,

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
    exitActLayoutMode: () => set({ layoutActId: null }),

    addPerformer: (name, x, y) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`
        const count = get().performers.length
        const offset = count * 40
        
        const finalX = x ?? ((get().canvasCenter?.x ?? 60) + offset)
        const finalY = y ?? ((get().canvasCenter?.y ?? 60) + offset)

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
        const count = get().performers.length
        const offset = count * 40

        const finalX = x ?? ((get().canvasCenter?.x ?? 60) + offset)
        const finalY = y ?? ((get().canvasCenter?.y ?? 60) + offset)

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

    enterFocusMode: (nodeId, nodeType, viewportSize) => enterFocusModeImpl(get, set, nodeId, nodeType, viewportSize),

    exitFocusMode: () => exitFocusModeImpl(get, set),

    switchFocusTarget: (nodeId, nodeType) => switchFocusTargetImpl(get, set, nodeId, nodeType),

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

    setWorkingDir: (dir) => setWorkingDirImpl(get, set, dir),

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


    addCanvasTerminal: () => addCanvasTerminalImpl(set, canvasTerminalIdCounter),

    removeCanvasTerminal: (id) => removeCanvasTerminalImpl(set, id),

    updateCanvasTerminalPosition: (id, x, y) => updateCanvasTerminalPositionImpl(set, id, x, y),

    updateCanvasTerminalSize: (id, width, height) => updateCanvasTerminalSizeImpl(set, id, width, height),

    updateCanvasTerminalSession: (id, sessionId, connected) => updateCanvasTerminalSessionImpl(set, id, sessionId, connected),

    closeTrackingWindow: () => closeTrackingWindowImpl(set),

    updateTrackingWindowPosition: (x, y) => updateTrackingWindowPositionImpl(set, x, y),

    updateTrackingWindowSize: (width, height) => updateTrackingWindowSizeImpl(set, width, height),

    upsertDraft: (draft) => {
        upsertDraftImpl(get, set, scheduleDraftPersist, draft)
    },

    savePerformerAsDraft: async (performerId) => savePerformerAsDraftImpl(get, set, performerId),

    loadDraftsFromDisk: async () => loadDraftsFromDiskImpl(set),

    saveActAsDraft: async (actId) => saveActAsDraftImpl(get, set, actId),

    addPerformerFromDraft: (name, draftContent) => addPerformerFromDraftImpl(get, set, performerIdCounter, name, draftContent),

    importActFromDraft: (name, draftContent) => importActFromDraftImpl(get, set, makeId, name, draftContent),

    createMarkdownEditor: (kind, options) => createMarkdownEditorImpl(get, set, markdownEditorIdCounter, makeId, kind, options),

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
