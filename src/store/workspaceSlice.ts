import type { StateCreator } from 'zustand'
import type { StudioState, WorkspaceSlice } from './types'
import { api, setApiWorkingDirContext } from '../api'
import { showToast } from '../lib/toast'
import {
    assetRefKey,
    buildPerformerConfigHash,
    createPerformerNode,
    createPerformerNodeFromAsset,
    isSameAssetRef,
    normalizePerformerAssetInput,
    registryAssetRef,
    registryAssetRefs,
} from '../lib/performers'
import { defaultActSessionMode } from '../lib/acts'
import { coerceStudioApiError } from '../lib/api-errors'
import { createActActions } from './actSlice'

export const performerIdCounter = { value: 0 }
export const markdownEditorIdCounter = { value: 0 }
export const canvasTerminalIdCounter = { value: 0 }
const TRACKING_WINDOW_ID = 'stage-tracking-window'
const genEdgeId = () => `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

// ── Path Utilities ──────────────────────────────────────
function normalizePath(dir: string): string {
    // Strip trailing slashes (macOS picker adds them), trim whitespace
    return dir.trim().replace(/\/+$/, '')
}

function getMaxPerformerCounter(performers: Array<{ id: string }>): number {
    return performers.reduce((max, performer) => {
        const match = performer.id.match(/^performer-(\d+)$/)
        if (!match) {
            return max
        }
        return Math.max(max, Number.parseInt(match[1], 10))
    }, 0)
}

function getMaxMarkdownEditorCounter(editors: Array<{ id: string }>): number {
    return editors.reduce((max, editor) => {
        const match = editor.id.match(/^markdown-editor-(\d+)$/)
        if (!match) {
            return max
        }
        return Math.max(max, Number.parseInt(match[1], 10))
    }, 0)
}

function defaultMarkdownContent(_kind: 'tal' | 'dance') {
    return ''
}

function applyPerformerPatch<T extends Record<string, any>>(performer: any, patch: T) {
    const mutatesPublishIdentity = (
        'name' in patch
        || 'talRef' in patch
        || 'danceRefs' in patch
        || 'model' in patch
        || 'modelPlaceholder' in patch
        || 'mcpServerNames' in patch
        || 'declaredMcpConfig' in patch
        || 'danceDeliveryMode' in patch
    ) && (patch.meta?.publishBindingUrn === undefined)

    const next = {
        ...performer,
        ...patch,
    }
    if (mutatesPublishIdentity) {
        next.meta = {
            ...performer.meta,
            ...patch.meta,
            publishBindingUrn: null,
        }
    }
    next.configHash = buildPerformerConfigHash(next)
    return next
}

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
            trackingWindow: null,
            isTrackingOpen: false,
            stageDirty: true,
        }))
        get().initRealtimeEvents()
        api.studio.activate(normalized).catch(err => console.warn('[studio] activate failed', err))
    },

    newStage: async () => {
        try {
            const res = await api.studio.pickDirectory()
            if (res.path) {
                const dir = normalizePath(res.path)
                if (!dir) return
                const stageList = await api.stages.list().catch(err => { console.warn('[studio] stage list failed', err); return [] })
                const existing = stageList.find((entry) => entry.workingDir === dir)
                if (existing) {
                    set({ stageList })
                    await get().loadStage(existing.id)
                    return
                }

                performerIdCounter.value = 0
                markdownEditorIdCounter.value = 0
                setApiWorkingDirContext(dir)
                set({
                    stageId: null,
                    stageList,
                    workingDir: dir,
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
                    chats: {},
                    actChats: {},
                    actPerformerChats: {},
                    actPerformerBindings: {},
                    activeChatPerformerId: null,
                    sessionMap: {},
                    sessionConfigMap: {},
                    actSessionMap: {},
                    sessions: [],
                    actSessions: [],
                    loadingActId: null,
                    lspServers: [],
                    lspDiagnostics: {},
                    trackingWindow: null,
                    isTrackingOpen: false,
                    stageDirty: true,
                })
                get().initRealtimeEvents()
                api.studio.activate(dir).catch(err => console.warn('[studio] activate failed', err))
            }
        } catch (err) {
            console.error('Failed to pick directory', err)
            showToast('Studio could not open the working directory picker.', 'error', {
                title: 'Directory picker failed',
                dedupeKey: 'workspace:directory-picker-failed',
                actionLabel: 'Retry',
                onAction: () => {
                    void get().newStage()
                },
            })
        }
    },

    saveStage: async () => {
        const {
            performers,
            edges,
            acts,
            drafts,
            markdownEditors,
            actChats,
            actPerformerChats,
            actPerformerBindings,
            actSessionMap,
            actSessions,
            sessionMap,
            sessionConfigMap,
            workingDir,
            trackingWindow,
        } = get()
        if (!workingDir) return
        const performersWithSessions = performers.map((a) => {
            const configHash = buildPerformerConfigHash(a)
            return {
                ...a,
                configHash: sessionConfigMap[a.id] || configHash,
                activeSessionId: sessionMap[a.id] || a.activeSessionId,
                declaredMcpConfig: a.declaredMcpConfig || null,
                modelPlaceholder: a.modelPlaceholder || null,
            }
        })
        const saved = await api.stages.save({
            schemaVersion: 3,
            workingDir: normalizePath(workingDir),
            performers: performersWithSessions,
            performerLinks: edges,
            acts,
            drafts,
            markdownEditors,
            canvasTerminals: get().canvasTerminals.map(t => ({
                ...t,
                sessionId: null,
                connected: false,
            })),
            trackingWindow,
            actChats,
            actPerformerChats,
            actPerformerBindings,
            actSessionMap,
            actSessions,
        })
        set({ stageDirty: false, stageId: saved.id })
        get().listStages()
        // Persist lastStage
        api.studio.updateConfig({ lastStage: saved.id }).catch(err => console.warn('[studio] lastStage persist failed', err))
    },

    loadStage: async (stageId) => {
        try {
            const data = await api.stages.get(stageId)
            const loadedPerformers = (data.performers || []).map((performer: any) => {
                const hydrated = createPerformerNode({
                    id: performer.id,
                    name: performer.name,
                    x: performer.position?.x || 0,
                    y: performer.position?.y || 0,
                    scope: performer.scope || 'shared',
                    ownerActId: performer.ownerActId || null,
                    talRef: performer.talRef || registryAssetRef(performer.talUrn),
                    danceRefs: performer.danceRefs || registryAssetRefs(performer.danceUrns),
                    model: performer.model || null,
                    modelPlaceholder: performer.modelPlaceholder || null,
                    modelVariant: performer.modelVariant || null,
                    mcpServerNames: performer.mcpServerNames || [],
                    declaredMcpConfig: performer.declaredMcpConfig || null,
                    danceDeliveryMode: performer.danceDeliveryMode || 'auto',
                    planMode: performer.planMode || false,
                    hidden: performer.hidden || false,
                    activeSessionId: performer.activeSessionId,
                    meta: performer.meta || (performer.sourcePerformerUrn ? { derivedFrom: performer.sourcePerformerUrn } : undefined),
                })
                return {
                    ...hydrated,
                    position: performer.position || hydrated.position,
                    width: performer.width || hydrated.width,
                    height: performer.height || hydrated.height,
                    configHash: performer.configHash || hydrated.configHash,
                }
            })
            performerIdCounter.value = getMaxPerformerCounter(loadedPerformers)
            const loadedMarkdownEditors = (data.markdownEditors || []).map((editor: any) => ({
                id: editor.id,
                kind: editor.kind === 'dance' ? 'dance' : 'tal',
                position: editor.position || { x: 160, y: 160 },
                width: editor.width || 520,
                height: editor.height || 360,
                draftId: editor.draftId,
                baseline: editor.baseline || null,
                attachTarget: editor.attachTarget || null,
                hidden: !!editor.hidden,
            }))
            markdownEditorIdCounter.value = getMaxMarkdownEditorCounter(loadedMarkdownEditors)

            const rehydratedSessionMap: Record<string, string> = {}
            const rehydratedSessionConfigMap: Record<string, string> = {}
            if (loadedPerformers) {
                loadedPerformers.forEach((a: any) => {
                    if (a.activeSessionId) rehydratedSessionMap[a.id] = a.activeSessionId
                    if (a.configHash) rehydratedSessionConfigMap[a.id] = a.configHash
                })
            }

            const workingDir = normalizePath(data.workingDir || '')
            setApiWorkingDirContext(workingDir || null)

            const loadedActSessions = Array.isArray(data.actSessions)
                ? data.actSessions
                    .filter((session: any) => (
                        session
                        && typeof session.id === 'string'
                        && typeof session.actId === 'string'
                    ))
                    .map((session: any) => {
                        const normalizedStatus = session.status === 'running'
                            ? 'interrupted'
                            : session.status === 'completed' || session.status === 'failed'
                                ? session.status
                                : 'idle'
                        return {
                            id: session.id,
                            actId: session.actId,
                            actName: typeof session.actName === 'string' ? session.actName : '',
                            title: typeof session.title === 'string' ? session.title : 'Session',
                            createdAt: typeof session.createdAt === 'number' ? session.createdAt : Date.now(),
                            updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : Date.now(),
                            status: normalizedStatus,
                            lastRunId: typeof session.lastRunId === 'string' ? session.lastRunId : null,
                            resumeSummary: session.resumeSummary && typeof session.resumeSummary === 'object'
                                ? {
                                    updatedAt: typeof session.resumeSummary.updatedAt === 'number' ? session.resumeSummary.updatedAt : Date.now(),
                                    runId: typeof session.resumeSummary.runId === 'string' ? session.resumeSummary.runId : null,
                                    currentNodeId: typeof session.resumeSummary.currentNodeId === 'string' ? session.resumeSummary.currentNodeId : null,
                                    finalOutput: typeof session.resumeSummary.finalOutput === 'string' ? session.resumeSummary.finalOutput : undefined,
                                    error: typeof session.resumeSummary.error === 'string' ? session.resumeSummary.error : undefined,
                                    iterations: typeof session.resumeSummary.iterations === 'number' ? session.resumeSummary.iterations : undefined,
                                    nodeOutputs: session.resumeSummary.nodeOutputs && typeof session.resumeSummary.nodeOutputs === 'object'
                                        ? Object.fromEntries(
                                            Object.entries(session.resumeSummary.nodeOutputs as Record<string, any>)
                                                .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
                                        )
                                        : {},
                                    history: Array.isArray(session.resumeSummary.history)
                                        ? session.resumeSummary.history.filter((entry: any) => (
                                            entry
                                            && typeof entry.nodeId === 'string'
                                            && typeof entry.nodeType === 'string'
                                            && typeof entry.action === 'string'
                                            && typeof entry.timestamp === 'number'
                                        ))
                                        : [],
                                    sessionHandles: Array.isArray(session.resumeSummary.sessionHandles)
                                        ? session.resumeSummary.sessionHandles.filter((entry: any) => (
                                            entry
                                            && typeof entry.handle === 'string'
                                            && typeof entry.nodeId === 'string'
                                            && typeof entry.nodeType === 'string'
                                        ))
                                        : [],
                                }
                                : null,
                        }
                    })
                : []
            const validActSessionIds = new Set(loadedActSessions.map((session: any) => session.id))
            const loadedActChats = data.actChats && typeof data.actChats === 'object'
                ? Object.fromEntries(
                    Object.entries(data.actChats as Record<string, any>)
                        .filter(([sessionId, messages]) => validActSessionIds.has(sessionId) && Array.isArray(messages)),
                )
                : {}
            for (const session of loadedActSessions) {
                if (session.status !== 'interrupted') {
                    continue
                }
                const messages = Array.isArray(loadedActChats[session.id]) ? [...loadedActChats[session.id]] : []
                const lastMessage = messages.at(-1)
                const interruptionMessage = 'This act thread was interrupted before the last run finished. Review the graph and rerun the prompt if needed.'
                if (
                    !lastMessage
                    || lastMessage.role !== 'system'
                    || lastMessage.content !== interruptionMessage
                ) {
                    messages.push({
                        id: `system-${session.id}-interrupted`,
                        role: 'system',
                        content: interruptionMessage,
                        timestamp: Date.now(),
                    })
                }
                loadedActChats[session.id] = messages
            }
            const loadedActSessionMap = data.actSessionMap && typeof data.actSessionMap === 'object'
                ? Object.fromEntries(
                    Object.entries(data.actSessionMap as Record<string, any>)
                        .filter(([_actId, sessionId]) => typeof sessionId === 'string' && validActSessionIds.has(sessionId)),
                )
                : {}
            const loadedActPerformerBindings = data.actPerformerBindings && typeof data.actPerformerBindings === 'object'
                ? Object.fromEntries(
                    Object.entries(data.actPerformerBindings as Record<string, any>)
                        .filter(([sessionId, bindings]) => validActSessionIds.has(sessionId) && Array.isArray(bindings))
                        .map(([sessionId, bindings]) => [
                            sessionId,
                            bindings.filter((binding: any) => (
                                binding
                                && typeof binding.sessionId === 'string'
                                && typeof binding.nodeId === 'string'
                                && typeof binding.nodeLabel === 'string'
                            )),
                        ]),
                )
                : {}
            const loadedActPerformerChats = data.actPerformerChats && typeof data.actPerformerChats === 'object'
                ? Object.fromEntries(
                    Object.entries(data.actPerformerChats as Record<string, any>)
                        .filter(([sessionId, chats]) => validActSessionIds.has(sessionId) && chats && typeof chats === 'object')
                        .map(([sessionId, chats]) => [
                            sessionId,
                            Object.fromEntries(
                                Object.entries(chats as Record<string, any>)
                                    .filter(([_performerSessionId, messages]) => Array.isArray(messages)),
                            ),
                        ]),
                )
                : {}

            set({
                stageId,
                performers: loadedPerformers,
                edges: data.performerLinks || [],
                acts: (data.acts || []).map((act: any) => ({
                    id: act.id,
                    name: act.name,
                    description: act.description || '',
                    hidden: !!act.hidden,
                    sessionMode: act.sessionMode === 'default' ? 'default' : defaultActSessionMode(),
                    bounds: act.bounds || {
                        x: 120,
                        y: 120,
                        width: 420,
                        height: 280,
                    },
                    entryNodeId: act.entryNodeId || act.entryNode || null,
                    nodes: (act.nodes || []).map((node: any) => {
                        if (node.type === 'parallel') {
                            return {
                                id: node.id,
                                type: 'parallel',
                                position: node.position || { x: 28, y: 56 },
                                join: node.join === 'any' ? 'any' : 'all',
                            }
                        }
                        if (node.type === 'orchestrator') {
                            return {
                                id: node.id,
                                type: 'orchestrator',
                                performerId: node.performerId || null,
                                modelVariant: node.modelVariant || null,
                                position: node.position || { x: 28, y: 56 },
                                maxDelegations: node.maxDelegations || 3,
                                sessionPolicy: node.sessionPolicy || 'node',
                                sessionLifetime: node.sessionLifetime || 'thread',
                                sessionModeOverride: !!node.sessionModeOverride,
                            }
                        }
                        return {
                            id: node.id,
                            type: 'worker',
                            performerId: node.performerId || null,
                            modelVariant: node.modelVariant || null,
                            position: node.position || { x: 28, y: 56 },
                            sessionPolicy: node.sessionPolicy || 'fresh',
                            sessionLifetime: node.sessionLifetime || 'run',
                            sessionModeOverride: !!node.sessionModeOverride,
                        }
                    }),
                    edges: (act.edges || []).map((edge: any) => ({
                        id: edge.id,
                        from: edge.from,
                        to: edge.to,
                        role: edge.role === 'branch' ? 'branch' : undefined,
                        condition: edge.condition,
                    })),
                    maxIterations: act.maxIterations || 10,
                    meta: act.meta || (act.sourceActUrn ? { derivedFrom: act.sourceActUrn } : undefined),
                })),
                drafts: data.drafts || {},
                markdownEditors: loadedMarkdownEditors,
                editingTarget: null,
                selectedPerformerId: null,
                selectedPerformerSessionId: null,
                selectedMarkdownEditorId: null,
                focusedPerformerId: null,
                focusedActId: null,
                selectedActId: null,
                selectedActSessionId: null,
                inspectorFocus: null,
                activeChatPerformerId: null,
                chats: {},
                sessionMap: rehydratedSessionMap,
                sessionConfigMap: rehydratedSessionConfigMap,
                sessions: [],
                actChats: loadedActChats,
                actPerformerChats: loadedActPerformerChats,
                actPerformerBindings: loadedActPerformerBindings,
                actSessionMap: loadedActSessionMap,
                actSessions: loadedActSessions,
                canvasTerminals: (data.canvasTerminals || []).map((t: any) => ({
                    id: t.id,
                    title: t.title || 'Terminal',
                    position: t.position || { x: 200, y: 200 },
                    width: t.width || 600,
                    height: t.height || 400,
                    sessionId: null,
                    connected: false,
                })),
                trackingWindow: data.trackingWindow && typeof data.trackingWindow === 'object'
                    ? {
                        id: typeof data.trackingWindow.id === 'string' ? data.trackingWindow.id : TRACKING_WINDOW_ID,
                        title: typeof data.trackingWindow.title === 'string' ? data.trackingWindow.title : 'Stage Tracking',
                        position: data.trackingWindow.position || { x: 260, y: 180 },
                        width: typeof data.trackingWindow.width === 'number' ? data.trackingWindow.width : 420,
                        height: typeof data.trackingWindow.height === 'number' ? data.trackingWindow.height : 360,
                    }
                    : null,
                isTrackingOpen: false,
                loadingActId: null,
                lspServers: [],
                lspDiagnostics: {},
                stageDirty: false,
                workingDir,
            })
            get().initRealtimeEvents()

            // Activate working directory on server
            if (workingDir) {
                api.studio.activate(workingDir).catch(err => console.warn('[studio] activate failed', err))
            }

            get().rehydrateSessions()
        } catch (err) {
            const apiError = coerceStudioApiError(err)
            if (apiError.status !== 404) {
                console.error(`Failed to load stage ${stageId}:`, err)
                showToast('Studio could not load the saved workspace state.', 'error', {
                    title: 'Workspace load failed',
                    dedupeKey: `workspace:load-stage:${stageId}`,
                    actionLabel: 'Retry',
                    onAction: () => {
                        void get().loadStage(stageId)
                    },
                })
            }
        }
    },

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

    addEdge: (from, to) => set((s) => ({
        edges: [...s.edges, { id: genEdgeId(), from, to }],
        stageDirty: true,
    })),

    removeEdge: (id) => set((s) => ({
        edges: s.edges.filter(e => e.id !== id),
        stageDirty: true,
    })),

    setPerformerTal: (performerId, tal) => set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, {
                talRef: tal?.urn ? { kind: 'registry' as const, urn: tal.urn } : null,
            })
        }),
        stageDirty: true,
    })),

    setPerformerTalRef: (performerId, talRef) => set((s) => ({
        performers: s.performers.map((a) => (
            a.id === performerId
                ? applyPerformerPatch(a, { talRef })
                : a
        )),
        stageDirty: true,
    })),

    addPerformerDance: (performerId, dance) => set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId && !a.danceRefs.some((ref) => ref.kind === 'registry' && ref.urn === dance.urn)
                ? applyPerformerPatch(a, {
                    danceRefs: [...a.danceRefs, { kind: 'registry' as const, urn: dance.urn }],
                })
                : a
        ),
        stageDirty: true,
    })),

    addPerformerDanceRef: (performerId, danceRef) => set((s) => ({
        performers: s.performers.map((a) => (
            a.id === performerId && !a.danceRefs.some((ref) => isSameAssetRef(ref, danceRef))
                ? applyPerformerPatch(a, {
                    danceRefs: [...a.danceRefs, danceRef],
                })
                : a
        )),
        stageDirty: true,
    })),

    replacePerformerDanceRef: (performerId, currentRef, nextRef) => set((s) => ({
        performers: s.performers.map((a) => (
            a.id === performerId
                ? applyPerformerPatch(a, {
                    danceRefs: a.danceRefs.map((ref) => (isSameAssetRef(ref, currentRef) ? nextRef : ref)),
                })
                : a
        )),
        stageDirty: true,
    })),

    removePerformerDance: (performerId, danceUrn) => set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId
                ? (() => {
                    const danceRefs = a.danceRefs.filter((ref) => assetRefKey(ref) !== danceUrn && !(ref.kind === 'registry' && ref.urn === danceUrn))
                    return applyPerformerPatch(a, { danceRefs })
                })()
                : a
        ),
        stageDirty: true,
    })),

    setPerformerModel: (performerId, model) => set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            const sameModel = (
                (a.model?.provider || null) === (model?.provider || null)
                && (a.model?.modelId || null) === (model?.modelId || null)
            )
            return applyPerformerPatch(a, {
                model,
                modelVariant: sameModel ? (a.modelVariant || null) : null,
                modelPlaceholder: null,
            })
        }),
        stageDirty: true,
    })),

    setPerformerModelVariant: (performerId, modelVariant) => set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, { modelVariant: modelVariant || null })
        }),
        stageDirty: true,
    })),

    setPerformerAgentId: (performerId, agentId) => set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, {
                agentId: agentId || null,
                planMode: agentId === 'plan',
            })
        }),
        stageDirty: true,
    })),

    setPerformerDanceDeliveryMode: (performerId, danceDeliveryMode) => set((s) => ({
        performers: s.performers.map(a => {
            if (a.id !== performerId) return a
            return applyPerformerPatch(a, { danceDeliveryMode })
        }),
        stageDirty: true,
    })),

    addPerformerMcp: (performerId, mcp) => set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId && !a.mcpServerNames.includes(mcp.name)
                ? (() => {
                    return applyPerformerPatch(a, { mcpServerNames: [...a.mcpServerNames, mcp.name] })
                })()
                : a
        ),
        stageDirty: true,
    })),

    removePerformerMcp: (performerId, mcpName) => set((s) => ({
        performers: s.performers.map(a =>
            a.id === performerId
                ? (() => {
                    const mcpServerNames = a.mcpServerNames.filter(name => name !== mcpName)
                    return applyPerformerPatch(a, { mcpServerNames })
                })()
                : a
        ),
        stageDirty: true,
    })),

    updatePerformerAuthoringMeta: (performerId, patch) => set((s) => ({
        performers: s.performers.map((a) => (
            a.id === performerId
                ? {
                    ...a,
                    meta: {
                        ...a.meta,
                        authoring: {
                            ...(a.meta?.authoring || {}),
                            ...patch,
                        },
                    },
                }
                : a
        )),
        stageDirty: true,
    })),

    togglePerformerVisibility: (id) => set((s) => ({
        performers: s.performers.map(a =>
            a.id === id ? { ...a, hidden: !a.hidden } : a
        ),
        stageDirty: true,
    })),

    setPerformerAutoCompact: (id, enabled) => set((s) => ({
        performers: s.performers.map(a =>
            a.id === id ? { ...a, autoCompact: enabled } : a
        ),
        stageDirty: true,
    })),

    toggleActVisibility: (id) => set((s) => ({
        acts: s.acts.map((act) => (
            act.id === id
                ? { ...act, hidden: !act.hidden }
                : act
        )),
        stageDirty: true,
    })),

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
        canvasTerminals: s.canvasTerminals.map(t =>
            t.id === id ? { ...t, position: { x, y } } : t
        ),
        stageDirty: true,
    })),

    updateCanvasTerminalSize: (id, width, height) => set((s) => ({
        canvasTerminals: s.canvasTerminals.map(t =>
            t.id === id ? { ...t, width, height } : t
        ),
        stageDirty: true,
    })),

    updateCanvasTerminalSession: (id, sessionId, connected) => set((s) => ({
        canvasTerminals: s.canvasTerminals.map(t =>
            t.id === id ? { ...t, sessionId, connected } : t
        ),
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
        const draftId = `${kind}-draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
        markdownEditors: s.markdownEditors.map((editor) => (
            editor.id === id
                ? { ...editor, position: { x, y } }
                : editor
        )),
        stageDirty: true,
    })),

    updateMarkdownEditorSize: (id, width, height) => set((s) => ({
        markdownEditors: s.markdownEditors.map((editor) => (
            editor.id === id
                ? { ...editor, width, height }
                : editor
        )),
        stageDirty: true,
    })),

    updateMarkdownEditorBaseline: (id, baseline) => set((s) => ({
        markdownEditors: s.markdownEditors.map((editor) => (
            editor.id === id
                ? { ...editor, baseline }
                : editor
        )),
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
