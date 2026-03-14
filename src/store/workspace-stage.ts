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
    buildPerformerConfigHash,
    createPerformerNode,
    registryAssetRef,
    registryAssetRefs,
} from '../lib/performers'

// defaultActSessionMode inlined (was in deleted lib/acts.ts)
const defaultActSessionMode = () => 'all_nodes_thread' as const
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
                chatPrefixes: {},
                actChats: {},
                actPerformerChats: {},
                actPerformerBindings: {},
                activeChatPerformerId: null,
                sessionMap: {},
                sessionConfigMap: {},
                actSessionMap: {},
                safeSummaries: {},
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
}

// ────────────────────────────────────────
// saveStage
// ────────────────────────────────────────

export async function saveStage(get: GetFn, set: SetFn) {
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
            mcpBindingMap: a.mcpBindingMap || {},
            modelPlaceholder: a.modelPlaceholder || null,
        }
    })
    const saved = await api.stages.save({
        schemaVersion: 4,
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
                ownerActId: performer.ownerActId || null,
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
            edges: (data.performerLinks || []).map((link: any) => ({
                ...link,
                interaction: link.interaction || 'request',
                description: link.description || link.condition || '',
            })),
            acts: (data.acts || []).map((act: any) => ({
                id: act.id,
                name: act.name,
                description: act.description || '',
                hidden: !!act.hidden,
                executionMode: act.executionMode === 'safe' ? 'safe' : 'direct',
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
            chatPrefixes: {},
            sessionMap: rehydratedSessionMap,
            sessionConfigMap: rehydratedSessionConfigMap,
            safeSummaries: {},
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
}
