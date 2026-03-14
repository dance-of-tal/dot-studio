import type { StateCreator } from 'zustand'
import type { StudioState, WorkspaceSlice } from './types'
import { api, setApiWorkingDirContext } from '../api'
import {
    createPerformerNode,
    createPerformerNodeFromAsset,
    normalizePerformerAssetInput,
} from '../lib/performers'
import { createActActions, makeId } from './actSlice-stub'

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
    setPerformerAutoCompact as setPerformerAutoCompactImpl,
} from './workspace-performer-config'

export const performerIdCounter = { value: 0 }
export const markdownEditorIdCounter = { value: 0 }
export const canvasTerminalIdCounter = { value: 0 }
const TRACKING_WINDOW_ID = 'stage-tracking-window'
const genEdgeId = () => makeId('edge')

export const createWorkspaceSlice: StateCreator<
    StudioState,
    [],
    [],
    WorkspaceSlice
> = (set, get) => ({
    stageId: null,
    performers: [],
    edges: [],
    acts: [],
    drafts: {},
    markdownEditors: [],
    editingTarget: null,
    selectedPerformerId: null,
    selectedPerformerSessionId: null,
    selectedMarkdownEditorId: null,
    focusedPerformerId: null,
    focusedActId: null,
    selectedActId: null,
    selectedActSessionId: null,
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

    addPerformer: (name, x, y) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`
        set((s) => ({
            performers: [...s.performers, createPerformerNode({ id, name, x, y })],
            editingTarget: null,
            selectedPerformerId: id,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            selectedActId: null,
            selectedActSessionId: null,
            focusedActId: null,
            activeChatPerformerId: id,
            inspectorFocus: null,
            stageDirty: true,
        }))
    },

    addPerformerFromAsset: (asset, x = 60 + (get().performers.length * 28), y = 60 + (get().performers.length * 20)) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`
        set((s) => ({
            performers: [...s.performers, createPerformerNodeFromAsset({ id, asset, x, y })],
            editingTarget: null,
            selectedPerformerId: id,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            selectedActId: null,
            selectedActSessionId: null,
            focusedActId: null,
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

    removePerformer: (id) => set((s) => {
        const acts = s.acts.map((act) => ({
            ...act,
            nodes: act.nodes.map((node) => (
                node.type !== 'parallel' && node.performerId === id
                    ? { ...node, performerId: null }
                    : node
            )),
        }))
        return {
            performers: s.performers.filter(a => a.id !== id),
            edges: s.edges.filter(e => e.from !== id && e.to !== id),
            acts,
            selectedPerformerId: s.selectedPerformerId === id ? null : s.selectedPerformerId,
            selectedPerformerSessionId: s.selectedPerformerId === id ? null : s.selectedPerformerSessionId,
            selectedMarkdownEditorId: s.selectedMarkdownEditorId,
            editingTarget: s.editingTarget?.type === 'performer' && s.editingTarget.id === id ? null : s.editingTarget,
            stageDirty: true,
        }
    }),

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

    selectPerformer: (id) => set({
        selectedPerformerId: id,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        selectedActId: null,
        selectedActSessionId: null,
        focusedPerformerId: null,
        focusedActId: null,
        inspectorFocus: null,
    }),

    selectPerformerSession: (sessionId) => set({ selectedPerformerSessionId: sessionId, selectedMarkdownEditorId: null }),

    selectMarkdownEditor: (id) => set({
        selectedMarkdownEditorId: id,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedActId: null,
        selectedActSessionId: null,
        focusedPerformerId: null,
        focusedActId: null,
        inspectorFocus: null,
    }),

    setFocusedPerformer: (id) => set({ focusedPerformerId: id }),
    setFocusedAct: (id) => set({ focusedActId: id }),

    selectAct: (id) => {
        set((state) => ({
            selectedActId: id,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            selectedActSessionId: state.selectedActId === id ? state.selectedActSessionId : null,
            focusedPerformerId: null,
            focusedActId: state.editingTarget?.type === 'act' && state.editingTarget.id === id ? id : null,
            inspectorFocus: state.selectedActId === id ? state.inspectorFocus : null,
        }))
        get().initRealtimeEvents()
    },

    selectActSession: (id) => {
        set({
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            selectedActSessionId: id,
            focusedActId: null,
            inspectorFocus: null,
        })
        get().initRealtimeEvents()
    },

    setActThreadSession: (actId, sessionId) => set((state) => {
        const nextActSessionMap = { ...state.actSessionMap }
        if (sessionId) {
            nextActSessionMap[actId] = sessionId
        } else {
            delete nextActSessionMap[actId]
        }
        return {
            actSessionMap: nextActSessionMap,
            stageDirty: true,
        }
    }),

    setInspectorFocus: (focus) => set({ inspectorFocus: focus }),

    openPerformerEditor: (id, focus = null) => set({
        editingTarget: { type: 'performer', id },
        selectedPerformerId: id,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        selectedActId: null,
        selectedActSessionId: null,
        focusedPerformerId: null,
        focusedActId: null,
        inspectorFocus: focus,
    }),

    openActEditor: (id, focus = null) => set({
        editingTarget: { type: 'act', id },
        isAssetLibraryOpen: true,
        selectedActId: id,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        selectedActSessionId: null,
        focusedPerformerId: null,
        focusedActId: id,
        inspectorFocus: focus,
    }),

    closeEditor: () => set({
        editingTarget: null,
        focusedActId: null,
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
            focusedActId: null,
            selectedActId: null,
            chats: {},
            chatPrefixes: {},
            actChats: {},
            actPerformerChats: {},
            actPerformerBindings: {},
            activeChatPerformerId: null,
            sessionMap: {},
            sessionConfigMap: {},
            actSessionMap: {},
            sessions: [],
            actSessions: [],
            selectedActSessionId: null,
            loadingActId: null,
            inspectorFocus: null,
            lspServers: [],
            lspDiagnostics: {},
            safeSummaries: {},
            trackingWindow: null,
            isTrackingOpen: false,
            stageDirty: true,
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
                actSessions: [],
                actChats: {},
                actPerformerChats: {},
                actPerformerBindings: {},
                actSessionMap: {},
                selectedActSessionId: null,
                selectedPerformerSessionId: null,
                selectedMarkdownEditorId: null,
                inspectorFocus: null,
                editingTarget: null,
                trackingWindow: null,
                isTrackingOpen: false,
            })
            api.studio.updateConfig({ lastStage: undefined }).catch(err => console.warn('[studio] clear lastStage failed', err))
        }
        get().listStages()
    },

    addEdge: (from, to, interaction = 'request', description = '') => set((s) => ({
        edges: [...s.edges, { id: genEdgeId(), from, to, interaction: interaction as any, description }],
        stageDirty: true,
    })),

    removeEdge: (id) => set((s) => ({
        edges: s.edges.filter(e => e.id !== id),
        stageDirty: true,
    })),

    updateEdgeDescription: (id, description) => set((s) => ({
        edges: s.edges.map(e => e.id === id ? { ...e, description } : e),
        stageDirty: true,
    })),

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

    setPerformerAutoCompact: (id, enabled) => setPerformerAutoCompactImpl(set, id, enabled),

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

    toggleActVisibility: (id) => set((s) => ({
        acts: s.acts.map((act) => (
            act.id === id
                ? { ...act, hidden: !act.hidden }
                : act
        )),
        stageDirty: true,
    })),

    setActExecutionMode: (actId, mode) => {
        set((state) => ({
            acts: state.acts.map((act) => (
                act.id === actId
                    ? { ...act, executionMode: mode }
                    : act
            )),
            stageDirty: true,
        }))
        get().clearSafeOwner('act', actId)
        get().detachActSession(
            actId,
            mode === 'safe'
                ? 'Switched this act to Safe mode. The next run will start in a safe workspace.'
                : 'Switched this act to Direct mode. The next run will start in the project workspace.',
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

    upsertDraft: (draft) => set((s) => ({
        drafts: {
            ...s.drafts,
            [draft.id]: draft,
        },
        stageDirty: true,
    })),

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
        const attachPerformerId = options?.attachTarget?.performerId || null
        const attachedAct = attachPerformerId
            ? get().acts.find((act) => act.nodes.some((node) => node.type !== 'parallel' && node.performerId === attachPerformerId)) || null
            : null
        const attachedNodeId = attachPerformerId && attachedAct
            ? attachedAct.nodes.find((node) => node.type !== 'parallel' && node.performerId === attachPerformerId)?.id || null
            : null

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
            selectedPerformerId: attachPerformerId && attachedAct ? s.selectedPerformerId : null,
            selectedPerformerSessionId: attachPerformerId && attachedAct ? s.selectedPerformerSessionId : null,
            selectedActId: attachedAct ? attachedAct.id : null,
            selectedActSessionId: attachedAct ? s.selectedActSessionId : null,
            focusedPerformerId: attachPerformerId && attachedAct ? s.focusedPerformerId : null,
            focusedActId: attachedAct ? attachedAct.id : null,
            inspectorFocus: attachedNodeId ? `act-node:${attachedNodeId}` : null,
            editingTarget: attachedAct ? { type: 'act', id: attachedAct.id } : s.editingTarget,
            stageDirty: true,
        }))

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

    // Act-related actions delegated to actSlice.ts
    ...createActActions(set, get, performerIdCounter),
})
