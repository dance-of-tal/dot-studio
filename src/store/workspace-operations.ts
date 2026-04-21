/**
 * Workspace CRUD operations extracted from workspaceSlice.
 *
 * Each function receives Zustand's `get` and `set` so it integrates
 * seamlessly back into the store slice.
 */

import type { StudioState } from './types'
import type {
    CanvasTerminalNode,
    MarkdownEditorNode,
    PerformerNode,
    SavedWorkspaceSnapshot,
    WorkspaceAct,
    WorkspaceActParticipantBinding,
} from '../types'
import { api, setApiWorkingDirContext } from '../api'
import { resolveActExpandedHeight, ACT_DEFAULT_WIDTH } from '../lib/act-layout'
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
import { createEmptyProjectionDirtyState } from './runtime-change-policy'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState
type PersistedPerformer = PerformerNode & {
    talUrn?: string
    danceUrns?: string[]
    sourcePerformerUrn?: string | null
}
type PersistedMarkdownEditor = Partial<MarkdownEditorNode> & Pick<MarkdownEditorNode, 'id' | 'draftId'> & {
    kind?: string
}
type PersistedCanvasTerminal = Partial<CanvasTerminalNode> & Pick<CanvasTerminalNode, 'id'>
type PersistedWorkspaceAct = Partial<WorkspaceAct> & Pick<WorkspaceAct, 'id' | 'name'> & {
    participants?: Record<string, Partial<WorkspaceActParticipantBinding>>
}
type PersistedWorkspaceSnapshot = SavedWorkspaceSnapshot & {
    performers: PersistedPerformer[]
    markdownEditors: PersistedMarkdownEditor[]
    acts?: PersistedWorkspaceAct[]
    canvasTerminals?: PersistedCanvasTerminal[]
}

// ────────────────────────────────────────
// newWorkspace
// ────────────────────────────────────────

export async function newWorkspace(get: GetFn, set: SetFn) {
    try {
        const res = await api.studio.pickDirectory()
        if (res.path) {
            const dir = normalizePath(res.path)
            if (!dir) return
            const workspaceList = await api.workspaces.list(true).catch(err => { console.warn('[studio] workspace list failed', err); return [] })
            const existing = workspaceList.find((entry) => entry.workingDir === dir)
            if (existing) {
                await get().loadWorkspace(existing.id)
                return
            }

            performerIdCounter.value = 0
            markdownEditorIdCounter.value = 0
            get().cleanupRealtimeEvents()
            setApiWorkingDirContext(dir)
            set({
                workspaceId: null,
                workspaceList,
                workingDir: dir,
                performers: [],
                acts: [],
                drafts: {},
                markdownEditors: [],
                canvasTerminals: [],
                editingTarget: null,
                selectedPerformerId: null,
                selectedPerformerSessionId: null,
                selectedMarkdownEditorId: null,
                focusSnapshot: null,
                inspectorFocus: null,
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
                sessions: [],
                isTrackingOpen: false,
                workspaceDirty: true,
                projectionDirty: createEmptyProjectionDirtyState(),
                runtimeReloadPending: false,
                actEditorState: null,
                actThreads: {},
                activeThreadId: null,
                activeThreadParticipantKey: null,
            })
            get().initRealtimeEvents()
            get().loadDraftsFromDisk()
            api.studio.activate(dir).catch(err => console.warn('[studio] activate failed', err))
        }
    } catch (err) {
        const normalized = coerceStudioApiError(err)
        if (normalized.message === 'Selection cancelled or failed') {
            return
        }
        console.error('Failed to pick directory', err)
        showToast('Studio could not open the working directory picker.', 'error', {
            title: 'Directory picker failed',
            dedupeKey: 'workspace:directory-picker-failed',
            actionLabel: 'Retry',
            onAction: () => {
                void get().newWorkspace()
            },
        })
    }
}

// ────────────────────────────────────────
// saveWorkspace
// ────────────────────────────────────────

export async function saveWorkspace(get: GetFn, set: SetFn) {
    const {
        performers,
        markdownEditors,
        chatKeyToSession,
        appliedAssistantActionMessageIds,
        assistantActionResults,
        workingDir,
    } = get()
    if (!workingDir) return
    const normalizedPerformers = performers.map((performer) => ({
        ...performer,
        declaredMcpConfig: performer.declaredMcpConfig || null,
        mcpBindingMap: performer.mcpBindingMap || {},
        modelPlaceholder: performer.modelPlaceholder || null,
    }))
    const chatBindings = Object.fromEntries(
        Object.entries(chatKeyToSession).filter(([, sessionId]) => !!sessionId),
    )
    const snapshot: SavedWorkspaceSnapshot = {
        schemaVersion: 1,
        workingDir: normalizePath(workingDir),
        performers: normalizedPerformers,
        chatBindings,
        assistantModel: get().assistantModel,
        appliedAssistantActionMessageIds,
        assistantActionResults,
        markdownEditors,
        canvasTerminals: get().canvasTerminals.map(t => ({
            ...t,
            sessionId: null,
            connected: false,
        })),
        acts: get().acts,
    }
    const saved = await api.workspaces.save(snapshot)
    set({ workspaceDirty: false, workspaceId: saved.id })
    get().listWorkspaces()
    api.studio.updateConfig({ lastWorkspaceId: saved.hiddenFromList ? undefined : saved.id }).catch(err => console.warn('[studio] lastWorkspaceId persist failed', err))
}

/**
 * Parse acts from loaded workspace data.
 * Ensures each act has required position/size fields.
 */
function parseActs(data: PersistedWorkspaceSnapshot): WorkspaceAct[] {
    if (!Array.isArray(data.acts)) return []

    const normalizeSubscriptions = (subscriptions: WorkspaceActParticipantBinding['subscriptions']) => {
        if (!subscriptions) return subscriptions
        return {
            ...subscriptions,
            ...(subscriptions.callboardKeys ? { callboardKeys: subscriptions.callboardKeys } : {}),
        }
    }

    return data.acts.map((act: PersistedWorkspaceAct, index: number) => {
        const participants = typeof act.participants === 'object' && act.participants
            ? Object.fromEntries(
                Object.entries(act.participants).map(([key, binding]: [string, Partial<WorkspaceActParticipantBinding>], performerIndex: number) => [key, {
                    ...binding,
                    subscriptions: normalizeSubscriptions(binding?.subscriptions),
                    position: binding?.position || { x: performerIndex * 300, y: 100 },
                }]),
            ) as Record<string, WorkspaceActParticipantBinding>
            : {}

        return {
            ...act,
            participants,
            relations: Array.isArray(act.relations) ? act.relations : [],
            position: act.position || { x: 200, y: 200 + index * 120 },
            width: act.width || ACT_DEFAULT_WIDTH,
            height: resolveActExpandedHeight(act.height),
            createdAt: typeof act.createdAt === 'number' ? act.createdAt : Date.now(),
        }
    })
}

// ────────────────────────────────────────
// loadWorkspace
// ────────────────────────────────────────

export async function loadWorkspace(workspaceId: string, get: GetFn, set: SetFn) {
    try {
        const data = await api.workspaces.get(workspaceId) as PersistedWorkspaceSnapshot
        const loadedPerformers = (data.performers || []).map((performer: PersistedPerformer) => {
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
                planMode: performer.planMode || false,
                hidden: performer.hidden || false,
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
        const loadedMarkdownEditors: MarkdownEditorNode[] = (data.markdownEditors || []).map((editor: PersistedMarkdownEditor) => {
            const kind: MarkdownEditorNode['kind'] = editor.kind === 'dance' ? 'dance' : 'tal'
            return {
                id: editor.id,
                kind,
                position: editor.position || { x: 160, y: 160 },
                width: editor.width || 520,
                height: editor.height || 360,
                draftId: editor.draftId,
                baseline: editor.baseline || null,
                attachTarget: editor.attachTarget || null,
                hidden: !!editor.hidden,
            }
        })
        markdownEditorIdCounter.value = getMaxMarkdownEditorCounter(loadedMarkdownEditors)

        const rehydratedChatBindings: Record<string, string> = { ...(data.chatBindings || {}) }
        const rehydratedSessionToChat = Object.fromEntries(
            Object.entries(rehydratedChatBindings).map(([chatKey, sessionId]) => [sessionId, chatKey]),
        )

        const workingDir = normalizePath(data.workingDir || '')
        setApiWorkingDirContext(workingDir || null)
        get().cleanupRealtimeEvents()

        set({
            workspaceId,
            performers: loadedPerformers,
            drafts: {},
            acts: parseActs(data),
            selectedActId: null,
            actEditorState: null,
            markdownEditors: loadedMarkdownEditors,
            editingTarget: null,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            selectedMarkdownEditorId: null,
            focusSnapshot: null,
            inspectorFocus: null,
            activeChatPerformerId: null,
            chatPrefixes: {},
            chatDrafts: {},
            assistantModel: data.assistantModel || null,
            assistantAvailableModels: [],
            appliedAssistantActionMessageIds: { ...(data.appliedAssistantActionMessageIds || {}) },
            assistantActionResults: { ...(data.assistantActionResults || {}) },
            seEntities: {},
            seMessages: {},
            seStatuses: {},
            sePermissions: {},
            seQuestions: {},
            seTodos: {},
            chatKeyToSession: rehydratedChatBindings,
            sessionToChatKey: rehydratedSessionToChat,
            sessionLoading: {},
            sessionMutationPending: {},
            sessionReverts: {},
            sessions: [],
            canvasTerminals: (data.canvasTerminals || []).map((t: PersistedCanvasTerminal) => ({
                id: t.id,
                title: t.title || 'Terminal',
                position: t.position || { x: 200, y: 200 },
                width: t.width || 600,
                height: t.height || 400,
                sessionId: null,
                connected: false,
            })),
            isTrackingOpen: false,
            workspaceDirty: false,
            projectionDirty: createEmptyProjectionDirtyState(),
            runtimeReloadPending: false,
            workingDir,
            actThreads: {},
            activeThreadId: null,
            activeThreadParticipantKey: null,
        })
        api.workspaces.setHidden(workspaceId, false)
            .then(() => get().listWorkspaces())
            .catch((err) => console.warn('[studio] workspace unhide failed', err))
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
            console.error(`Failed to load stage ${workspaceId}:`, err)
            showToast('Studio could not load the saved workspace state.', 'error', {
                title: 'Workspace load failed',
                dedupeKey: `workspace:load-stage:${workspaceId}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void get().loadWorkspace(workspaceId)
                },
            })
        }
    }
}
