import type { StateCreator } from 'zustand'
import type { StudioState, WorkspaceSlice } from './types'
import { api, setApiWorkingDirContext } from '../api'
import { scheduleActRuntimeSync } from './act-slice-helpers'
import { showToast } from '../lib/toast'
import {
    createPerformerNode,
    createPerformerNodeFromAsset,
    normalizePerformerAssetInput,
    PERFORMER_DEFAULT_HEIGHT,
    PERFORMER_DEFAULT_WIDTH,
} from '../lib/performers'
import {
    applyPerformerPatch,
    mapMarkdownEditors,
    resolveCanvasSpawnPosition,
} from './workspace-helpers'
import {
    collectVisibleCanvasNodeRects,
    resolveCanvasNodeSpawnPosition,
} from '../lib/canvas-node-layout'
import {
    newWorkspace as newWorkspaceImpl,
    saveWorkspace as saveWorkspaceImpl,
    loadWorkspace as loadWorkspaceImpl,
} from './workspace-operations'
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
    openDraftEditorImpl,
    saveMarkdownDraftImpl,
    saveActAsDraftImpl,
    savePerformerAsDraftImpl,
    upsertDraftImpl,
} from './workspace-draft-actions'
import {
    addCanvasTerminalImpl,
    buildExitFocusModeState,
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
import { buildPerformerDeleteCascade } from './cascade-cleanup'
import { hasRunningStudioSessions } from './runtime-reload-utils'
import {
    classifyStudioChange,
    clearProjectionDirtyState,
    createEmptyProjectionDirtyState,
    mergeProjectionDirtyState,
} from './runtime-change-policy'
import { clearChatSessionView } from './session'

export const performerIdCounter = { value: 0 }
export const markdownEditorIdCounter = { value: 0 }
export const canvasTerminalIdCounter = { value: 0 }
const TRACKING_WINDOW_ID = 'workspace-tracking-window'
const RUNTIME_RELOAD_RETRY_MS = 300

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Ensure performer name is unique on the canvas by appending " (N)" suffix if needed. */
function uniquePerformerName(desired: string, existingNames: string[]): string {
    if (!existingNames.includes(desired)) return desired
    let i = 2
    while (existingNames.includes(`${desired} (${i})`)) i++
    return `${desired} (${i})`
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

function buildClosedWorkspaceState(): Partial<StudioState> {
    return {
        workspaceId: null,
        workingDir: '',
        performers: [],
        acts: [],
        drafts: {},
        markdownEditors: [],
        canvasTerminals: [],
        trackingWindow: null,
        canvasCenter: null,
        layoutActId: null,
        editingTarget: null,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        selectedActId: null,
        actEditorState: null,
        activeThreadId: null,
        activeThreadParticipantKey: null,
        actThreads: {},
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceList: [],
        workspaceDirty: false,
        projectionDirty: createEmptyProjectionDirtyState(),
        runtimeReloadPending: false,
        sessions: [],
        activeChatPerformerId: null,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatDrafts: {},
        chatPrefixes: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionMutationPending: {},
        sessionReverts: {},
    }
}

export const createWorkspaceSlice: StateCreator<
    StudioState,
    [],
    [],
    WorkspaceSlice
> = (set, get) => ({
    workspaceId: null,
    performers: [],
    drafts: {},
    markdownEditors: [],
    editingTarget: null,
    selectedPerformerId: null,
    selectedPerformerSessionId: null,
    selectedMarkdownEditorId: null,
    focusSnapshot: null,
    canvasRevealTarget: null,
    inspectorFocus: null,
    workspaceList: [],
    workspaceDirty: false,
    projectionDirty: createEmptyProjectionDirtyState(),
    runtimeReloadPending: false,
    theme: (localStorage.getItem('dot-theme') as 'light' | 'dark') || 'light',
    workingDir: '',
    isTerminalOpen: false,
    isTrackingOpen: false,
    isAssetLibraryOpen: false,
    canvasTerminals: [],
    trackingWindow: null,
    canvasCenter: null,
    layoutActId: null,
    actEditorState: null,

    setTerminalOpen: (open) => set({ isTerminalOpen: open }),
    setTrackingOpen: (open) => set((state) => {
        const created = open && !state.trackingWindow
        const trackingPosition = resolveCanvasSpawnPosition({
            canvasCenter: state.canvasCenter,
            existingCount: state.canvasTerminals.length,
            width: 420,
            height: 360,
        })
        return {
            isTrackingOpen: open,
            trackingWindow: open
                ? (state.trackingWindow || {
                    id: TRACKING_WINDOW_ID,
                    title: 'Workspace Tracking',
                    position: trackingPosition,
                    width: 420,
                    height: 360,
                })
                : state.trackingWindow,
            workspaceDirty: created ? true : state.workspaceDirty,
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

    markProjectionDirty: (patch) => set((state) => ({
        projectionDirty: mergeProjectionDirtyState(state.projectionDirty, {
            kind: 'draft',
            performerIds: patch.performerIds || [],
            actIds: patch.actIds || [],
            draftIds: patch.draftIds || [],
            workspaceWide: patch.workspaceWide === true,
        }),
    })),

    clearProjectionDirty: (patch) => set((state) => ({
        projectionDirty: clearProjectionDirtyState(state.projectionDirty, patch),
    })),

    recordStudioChange: (change) => {
        const changeClass = classifyStudioChange(change)
        if (changeClass === 'lazy_projection' && change.kind !== 'ui' && change.kind !== 'runtime_config') {
            set((state) => ({
                projectionDirty: mergeProjectionDirtyState(state.projectionDirty, change),
            }))
            return changeClass
        }
        if (changeClass === 'runtime_reload') {
            get().markRuntimeReloadPending()
        }
        return changeClass
    },

    addPerformer: (name, x, y) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`
        const state = get()
        const safeName = uniquePerformerName(name, state.performers.map(p => p.name))
        const spawnPosition = resolveCanvasNodeSpawnPosition({
            canvasCenter: state.canvasCenter,
            occupiedRects: collectVisibleCanvasNodeRects(state.performers, state.acts),
            width: PERFORMER_DEFAULT_WIDTH,
            height: PERFORMER_DEFAULT_HEIGHT,
        })

        const finalX = x ?? spawnPosition.x
        const finalY = y ?? spawnPosition.y

        set((s) => ({
            performers: [...s.performers, createPerformerNode({ id, name: safeName, x: finalX, y: finalY })],
            editingTarget: null,
            selectedPerformerId: id,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            activeChatPerformerId: id,
            canvasRevealTarget: {
                id,
                type: 'performer',
                nonce: (s.canvasRevealTarget?.nonce || 0) + 1,
            },
            inspectorFocus: null,
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'performer', performerIds: [id] })
        return id
    },

    addPerformerFromAsset: (asset, x, y) => {
        performerIdCounter.value++
        const id = `performer-${performerIdCounter.value}`
        const state = get()
        const safeName = uniquePerformerName(asset.name, state.performers.map(p => p.name))
        const spawnPosition = resolveCanvasNodeSpawnPosition({
            canvasCenter: state.canvasCenter,
            occupiedRects: collectVisibleCanvasNodeRects(state.performers, state.acts),
            width: PERFORMER_DEFAULT_WIDTH,
            height: PERFORMER_DEFAULT_HEIGHT,
        })

        const finalX = x ?? spawnPosition.x
        const finalY = y ?? spawnPosition.y

        set((s) => ({
            performers: [...s.performers, createPerformerNodeFromAsset({ id, asset: { ...asset, name: safeName }, x: finalX, y: finalY })],
            editingTarget: null,
            selectedPerformerId: id,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            activeChatPerformerId: id,
            canvasRevealTarget: {
                id,
                type: 'performer',
                nonce: (s.canvasRevealTarget?.nonce || 0) + 1,
            },
            inspectorFocus: null,
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'performer', performerIds: [id] })
    },

    applyPerformerAsset: (performerId, asset) => {
        set((s) => {
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
                        modelVariant: normalized.modelVariant,
                        mcpServerNames: normalized.mcpServerNames,
                        mcpBindingMap: normalized.mcpBindingMap,
                        declaredMcpConfig: normalized.declaredMcpConfig,
                        meta: normalized.meta,
                    })
                }),
                workspaceDirty: true,
            }
        })
        get().recordStudioChange({ kind: 'performer', performerIds: [performerId] })
    },

    removePerformer: (id) => {
        const sessionId = get().chatKeyToSession[id] || null
        const performer = get().performers.find((entry) => entry.id === id)
        if (!performer) {
            return
        }

        set((s) => {
            const focusExit = buildExitFocusModeState(s)
            const baseActs = (focusExit?.acts as StudioState['acts'] | undefined) || s.acts
            const basePerformers = (focusExit?.performers as StudioState['performers'] | undefined) || s.performers
            const actCascade = buildPerformerDeleteCascade(performer, baseActs)
            return {
                ...focusExit,
                performers: basePerformers.filter(a => a.id !== id),
                acts: actCascade.acts || baseActs,
                selectedPerformerId: s.selectedPerformerId === id ? null : s.selectedPerformerId,
                selectedPerformerSessionId: s.selectedPerformerId === id ? null : s.selectedPerformerSessionId,
                selectedMarkdownEditorId: s.selectedMarkdownEditorId,
                editingTarget: s.editingTarget?.type === 'performer' && s.editingTarget.id === id ? null : s.editingTarget,
                activeChatPerformerId: s.activeChatPerformerId === id ? null : s.activeChatPerformerId,
                workspaceDirty: true,
            }
        })

        if (sessionId) {
            clearChatSessionView(get, id)
            get().removeSession(sessionId)
            set((state) => ({
                sessions: state.sessions.filter((session) => session.id !== sessionId),
            }))

            void api.chat.deleteSession(sessionId)
                .catch((error) => {
                    console.error('Failed to delete performer session', error)
                    showToast('Failed to delete performer session', 'error', {
                        title: 'Thread delete failed',
                        dedupeKey: `thread:delete:${sessionId}`,
                    })
                })
                .finally(() => {
                    void get().listSessions()
                })
        }

        get().recordStudioChange({ kind: 'performer', performerIds: [id], workspaceWide: true })
    },

    updatePerformerPosition: (id, x, y) => set((s) => ({
        performers: s.performers.map(a => a.id === id ? { ...a, position: { x, y } } : a),
        workspaceDirty: true
    })),

    updatePerformerSize: (id, width, height) => set((s) => ({
        performers: s.performers.map(a => a.id === id ? { ...a, width, height } : a),
        workspaceDirty: true
    })),

    updatePerformerName: (id, name) => {
        const state = get()
        const performer = state.performers.find(p => p.id === id)
        if (!performer) return
        const safeName = uniquePerformerName(name, state.performers.filter(p => p.id !== id).map(p => p.name))
        const affectedActIds: string[] = []
        set((s) => {
            const nextActs = s.acts.map((act) => {
                let changed = false
                const nextParticipants = Object.fromEntries(
                    Object.entries(act.participants).map(([participantKey, binding]) => {
                        const matchesDraft = binding.performerRef.kind === 'draft' && binding.performerRef.draftId === id
                        const matchesRegistry = binding.performerRef.kind === 'registry'
                            && !!performer.meta?.derivedFrom
                            && binding.performerRef.urn === performer.meta.derivedFrom
                        if (!matchesDraft && !matchesRegistry) {
                            return [participantKey, binding]
                        }
                        changed = true
                        return [participantKey, { ...binding, displayName: safeName }]
                    }),
                )

                if (changed) {
                    affectedActIds.push(act.id)
                    return { ...act, participants: nextParticipants }
                }

                return act
            })
            return {
                performers: s.performers.map(a => a.id === id ? applyPerformerPatch(a, { name: safeName }) : a),
                acts: nextActs,
                workspaceDirty: true,
            }
        })
        get().recordStudioChange({
            kind: 'act',
            performerIds: [id],
            actIds: affectedActIds,
        })
        for (const actId of affectedActIds) {
            scheduleActRuntimeSync(get, set, actId)
        }
    },

    selectPerformer: (id) => set((s) => ({
        selectedPerformerId: id,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        // Clear act selection only when selecting a real performer (not when deselecting)
        selectedActId: id ? null : s.selectedActId,
        actEditorState: id ? null : s.actEditorState,
        inspectorFocus: null,
    })),

    selectPerformerSession: (sessionId) => set({ selectedPerformerSessionId: sessionId, selectedMarkdownEditorId: null }),

    selectMarkdownEditor: (id) => set((s) => ({
        ...((id && s.focusSnapshot) ? (buildExitFocusModeState(s) || {}) : {}),
        selectedMarkdownEditorId: id,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedActId: id ? null : s.selectedActId,
        actEditorState: id ? null : s.actEditorState,
        focusSnapshot: (id && s.focusSnapshot) ? null : s.focusSnapshot,
        inspectorFocus: null,
    })),

    enterFocusMode: (nodeId, nodeType, viewportSize) => enterFocusModeImpl(get, set, nodeId, nodeType, viewportSize),

    exitFocusMode: () => exitFocusModeImpl(get, set),

    switchFocusTarget: (nodeId, nodeType) => switchFocusTargetImpl(get, set, nodeId, nodeType),

    revealCanvasNode: (nodeId, nodeType) => set((state) => ({
        canvasRevealTarget: {
            id: nodeId,
            type: nodeType,
            nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
        },
    })),

    setInspectorFocus: (focus) => set({ inspectorFocus: focus }),

    openPerformerEditor: (id, focus = null) => set({
        editingTarget: { type: 'performer', id },
        selectedPerformerId: id,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        selectedActId: null,
        actEditorState: null,
        inspectorFocus: focus,
    }),

    closeEditor: () => set({
        editingTarget: null,
        inspectorFocus: null,
    }),

    setWorkingDir: (dir) => setWorkingDirImpl(get, set, dir),

    newWorkspace: async () => newWorkspaceImpl(get, set),

    closeWorkspace: async () => {
        const currentWorkspaceId = get().workspaceId
        if (currentWorkspaceId) {
            if (get().workspaceDirty) {
                await saveWorkspaceImpl(get, set)
            }
            await api.workspaces.setHidden(currentWorkspaceId, true)
        }
        get().cleanupRealtimeEvents()
        setApiWorkingDirContext(null)
        set(buildClosedWorkspaceState())
        await get().listWorkspaces()
        api.studio.updateConfig({ lastWorkspaceId: undefined }).catch(err => console.warn('[studio] clear lastWorkspaceId failed', err))
    },

    saveWorkspace: async () => saveWorkspaceImpl(get, set),

    loadWorkspace: async (workspaceId) => loadWorkspaceImpl(workspaceId, get, set),

    listWorkspaces: async () => {
        try {
            const list = await api.workspaces.list()
            set({ workspaceList: list })
        } catch {
            set({ workspaceList: [] })
        }
    },

    deleteWorkspace: async (workspaceId) => {
        if (!workspaceId) return
        await api.workspaces.delete(workspaceId)
        if (get().workspaceId === workspaceId) {
            get().cleanupRealtimeEvents()
            setApiWorkingDirContext(null)
            set(buildClosedWorkspaceState())
            api.studio.updateConfig({ lastWorkspaceId: undefined }).catch(err => console.warn('[studio] clear lastWorkspaceId failed', err))
        }
        get().listWorkspaces()
    },

    markRuntimeReloadPending: () => {
        const state = get()
        if (!state.workingDir) {
            return
        }
        if (!state.runtimeReloadPending) {
            set({ runtimeReloadPending: true })
        }
        if (hasRunningStudioSessions(state)) {
            showToast(
                'Runtime-affecting changes were made while a session is running. Finish the current run before starting a new chat.',
                'warning',
                {
                    title: 'Finish current run first',
                    dedupeKey: `runtime-reload-pending:${state.workingDir}`,
                    durationMs: 6000,
                },
            )
        }
    },

    clearRuntimeReloadPending: () => set({ runtimeReloadPending: false }),

    applyPendingRuntimeReload: async () => {
        const state = get()
        if (!state.runtimeReloadPending || !state.workingDir) {
            return false
        }

        try {
            let result = await api.opencodeApplyRuntimeReload()
            if (
                result.blocked
                && result.runningSessions > 0
                && !hasRunningStudioSessions(get())
            ) {
                await sleep(RUNTIME_RELOAD_RETRY_MS)
                result = await api.opencodeApplyRuntimeReload()
            }
            if (result.applied) {
                set({ runtimeReloadPending: false })
                return true
            }
            if (result.blocked) {
                showToast(
                    `OpenCode still has ${result.runningSessions} running session${result.runningSessions === 1 ? '' : 's'}. New chats stay blocked until those runs finish.`,
                    'warning',
                    {
                        title: 'New chat blocked',
                        dedupeKey: `runtime-reload-blocked:${state.workingDir}`,
                        durationMs: 6000,
                    },
                )
            }
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : 'Failed to apply queued runtime changes.',
                'error',
                {
                    title: 'Runtime refresh failed',
                    dedupeKey: `runtime-reload-error:${state.workingDir}`,
                },
            )
        }

        return false
    },
    setPerformerTal: (performerId, tal) => setPerformerTalImpl(set, get, performerId, tal),

    setPerformerTalRef: (performerId, talRef) => setPerformerTalRefImpl(set, get, performerId, talRef),

    addPerformerDance: (performerId, dance) => addPerformerDanceImpl(set, get, performerId, dance),

    addPerformerDanceRef: (performerId, danceRef) => addPerformerDanceRefImpl(set, get, performerId, danceRef),

    replacePerformerDanceRef: (performerId, currentRef, nextRef) => replacePerformerDanceRefImpl(set, get, performerId, currentRef, nextRef),

    removePerformerDance: (performerId, danceUrn) => removePerformerDanceImpl(set, get, performerId, danceUrn),

    setPerformerModel: (performerId, model) => setPerformerModelImpl(set, get, performerId, model),

    setPerformerModelVariant: (performerId, modelVariant) => setPerformerModelVariantImpl(set, get, performerId, modelVariant),

    setPerformerAgentId: (performerId, agentId) => setPerformerAgentIdImpl(set, get, performerId, agentId),
    addPerformerMcp: (performerId, mcp) => addPerformerMcpImpl(set, get, performerId, mcp),

    removePerformerMcp: (performerId, mcpName) => removePerformerMcpImpl(set, get, performerId, mcpName),

    setPerformerMcpBinding: (performerId, placeholderName, serverName) => setPerformerMcpBindingImpl(set, get, performerId, placeholderName, serverName),

    updatePerformerAuthoringMeta: (performerId, patch) => updatePerformerAuthoringMetaImpl(set, get, performerId, patch),

    togglePerformerVisibility: (id) => togglePerformerVisibilityImpl(set, get, id),
    addCanvasTerminal: () => addCanvasTerminalImpl(get, set, canvasTerminalIdCounter),

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

    addPerformerFromDraft: (name, draftContent, description) => addPerformerFromDraftImpl(get, set, performerIdCounter, name, draftContent, description),

    importActFromDraft: (name, draftContent) => importActFromDraftImpl(get, set, makeId, name, draftContent),

    createMarkdownEditor: (kind, options) => createMarkdownEditorImpl(get, set, markdownEditorIdCounter, makeId, kind, options),

    openDraftEditor: (draftId) => openDraftEditorImpl(get, set, markdownEditorIdCounter, draftId),

    saveMarkdownDraft: async (editorId) => saveMarkdownDraftImpl(get, set, editorId),

    updateMarkdownEditorPosition: (id, x, y) => set((s) => ({
        markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, position: { x, y } })),
        workspaceDirty: true,
    })),

    updateMarkdownEditorSize: (id, width, height) => set((s) => ({
        markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, width, height })),
        workspaceDirty: true,
    })),

    updateMarkdownEditorBaseline: (id, baseline) => set((s) => ({
        markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, baseline })),
        workspaceDirty: true,
    })),

    removeMarkdownEditor: (id) => set((s) => ({
        markdownEditors: s.markdownEditors.filter((editor) => editor.id !== id),
        selectedMarkdownEditorId: s.selectedMarkdownEditorId === id ? null : s.selectedMarkdownEditorId,
        workspaceDirty: true,
    })),

})
