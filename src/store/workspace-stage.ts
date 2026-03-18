/**
 * Stage CRUD operations extracted from workspaceSlice.
 *
 * Each function receives Zustand's `get` and `set` so it integrates
 * seamlessly back into the store slice.
 */

import type { StudioState } from './types'
import { api, setApiWorkingDirContext } from '../api'
import { showToast } from '../lib/toast'
import {
    createPerformerNode,
    registryAssetRef,
    registryAssetRefs,
} from '../lib/performers'
import { coerceStudioApiError } from '../lib/api-errors'
import {
    getMaxMarkdownEditorCounter,
    getMaxPerformerCounter,
    normalizePath,
} from './workspace-helpers'
import { performerIdCounter, markdownEditorIdCounter } from './workspaceSlice'

const TRACKING_WINDOW_ID = 'stage-tracking-window'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

// ────────────────────────────────────────
// newStage
// ────────────────────────────────────────

export async function newStage(get: GetFn, set: SetFn) {
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
                acts: [],
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
                chats: {},
                chatPrefixes: {},
                activeChatPerformerId: null,
                sessionMap: {},
                safeSummaries: {},
                sessions: [],
                lspServers: [],
                lspDiagnostics: {},
                trackingWindow: null,
                isTrackingOpen: false,
                stageDirty: true,
                selectedActParticipantKey: null,
                selectedRelationId: null,
                actThreads: {},
                activeThreadId: null,
                activeThreadParticipantKey: null,
            })
            get().initRealtimeEvents()
            get().loadDraftsFromDisk()
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
}

// ────────────────────────────────────────
// saveStage
// ────────────────────────────────────────

export async function saveStage(get: GetFn, set: SetFn) {
    const {
        performers,
        markdownEditors,
        sessionMap,
        workingDir,
        trackingWindow,
    } = get()
    if (!workingDir) return
    const performersWithSessions = performers.map((a) => {
        return {
            ...a,
            activeSessionId: sessionMap[a.id] || a.activeSessionId,
            declaredMcpConfig: a.declaredMcpConfig || null,
            mcpBindingMap: a.mcpBindingMap || {},
            modelPlaceholder: a.modelPlaceholder || null,
        }
    })
    const saved = await api.stages.save({
        schemaVersion: 5,
        workingDir: normalizePath(workingDir),
        performers: performersWithSessions,
        markdownEditors,
        canvasTerminals: get().canvasTerminals.map(t => ({
            ...t,
            sessionId: null,
            connected: false,
        })),
        trackingWindow,
        acts: get().acts,
    } as any)
    set({ stageDirty: false, stageId: saved.id })
    get().listStages()
    // Persist lastStage
    api.studio.updateConfig({ lastStage: saved.id }).catch(err => console.warn('[studio] lastStage persist failed', err))
}

/**
 * Parse acts from loaded stage data.
 * Ensures each act has required position/size fields.
 */
function parseActs(data: any): any[] {
    if (!Array.isArray(data.acts)) return []

    const normalizeSubscriptions = (subscriptions: any) => {
        if (!subscriptions) return subscriptions
        const callboardKeys = subscriptions.callboardKeys || subscriptions.boardKeys
        return {
            ...subscriptions,
            ...(callboardKeys ? { callboardKeys, boardKeys: callboardKeys } : {}),
        }
    }

    const normalizePermissions = (permissions: any) => {
        if (!permissions) return permissions
        const callboardKeys = permissions.callboardKeys || permissions.boardKeys
        return {
            ...permissions,
            ...(callboardKeys ? { callboardKeys, boardKeys: callboardKeys } : {}),
        }
    }

    return data.acts.map((act: any, index: number) => {
        const performers = typeof act.performers === 'object' && act.performers
            ? Object.fromEntries(
                Object.entries(act.performers).map(([key, binding]: [string, any], performerIndex) => [key, {
                    ...binding,
                    subscriptions: normalizeSubscriptions(binding?.subscriptions),
                    position: binding?.position || { x: performerIndex * 300, y: 100 },
                }]),
            )
            : {}

        return {
            ...act,
            performers,
            relations: Array.isArray(act.relations)
                ? act.relations.map((relation: any) => ({
                    ...relation,
                    permissions: normalizePermissions(relation?.permissions),
                }))
                : [],
            position: act.position || { x: 200, y: 200 + index * 120 },
            width: act.width || 340,
            height: act.height || 80,
        }
    })
}

// ────────────────────────────────────────
// loadStage
// ────────────────────────────────────────

export async function loadStage(stageId: string, get: GetFn, set: SetFn) {
    try {
        const data = await api.stages.get(stageId)
        const loadedPerformers = (data.performers || []).map((performer: any) => {
            const hydrated = createPerformerNode({
                id: performer.id,
                name: performer.name,
                x: performer.position?.x || 0,
                y: performer.position?.y || 0,
                scope: performer.scope || 'shared',
                talRef: performer.talRef || registryAssetRef(performer.talUrn),
                danceRefs: performer.danceRefs || registryAssetRefs(performer.danceUrns),
                model: performer.model || null,
                modelPlaceholder: performer.modelPlaceholder || null,
                modelVariant: performer.modelVariant || null,
                mcpServerNames: performer.mcpServerNames || [],
                mcpBindingMap: performer.mcpBindingMap || {},
                declaredMcpConfig: performer.declaredMcpConfig || null,
                danceDeliveryMode: performer.danceDeliveryMode || 'auto',
                executionMode: performer.executionMode === 'safe' ? 'safe' : 'direct',
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
        if (loadedPerformers) {
            loadedPerformers.forEach((a: any) => {
                if (a.activeSessionId) rehydratedSessionMap[a.id] = a.activeSessionId
            })
        }

        const workingDir = normalizePath(data.workingDir || '')
        setApiWorkingDirContext(workingDir || null)

        set({
            stageId,
            performers: loadedPerformers,
            drafts: {},
            acts: parseActs(data),
            selectedActId: null,
            layoutActId: null,
            selectedActParticipantKey: null,
            selectedRelationId: null,
            markdownEditors: loadedMarkdownEditors,
            editingTarget: null,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            focusedPerformerId: null,
            focusedNodeType: null,
            focusSnapshot: null,
            inspectorFocus: null,
            activeChatPerformerId: null,
            chats: {},
            chatPrefixes: {},
            sessionMap: rehydratedSessionMap,
            safeSummaries: {},
            sessions: [],
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
            lspServers: [],
            lspDiagnostics: {},
            stageDirty: false,
            workingDir,
            actThreads: {},
            activeThreadId: null,
            activeThreadParticipantKey: null,
        })
        get().initRealtimeEvents()

        // Activate working directory on server
        if (workingDir) {
            api.studio.activate(workingDir).catch(err => console.warn('[studio] activate failed', err))
        }

        get().rehydrateSessions()
        get().listSessions()

        // Load all drafts from disk into memory
        get().loadDraftsFromDisk()
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
}
