import { api, setApiWorkingDirContext } from '../api'
import { resolveActExpandedHeight } from '../lib/act-layout'
import { getCanvasViewportSize, resolveFocusTarget } from '../lib/focus-utils'
import { normalizePath, mapCanvasTerminals, resolveCanvasSpawnPosition } from './workspace-helpers'
import type { FocusSnapshot, StudioState } from './types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState
type FocusNodeType = FocusSnapshot['type']
type FocusTarget = { id: string; type: FocusNodeType }
type ViewportSize = { width: number; height: number }
const FOCUS_WINDOW_ORIGIN = { x: 0, y: 0 } as const

function resolveFocusNodeSize(state: StudioState, target: FocusTarget) {
    if (target.type === 'performer') {
        const performer = state.performers.find((entry) => entry.id === target.id)
        return performer
            ? { width: performer.width ?? 400, height: performer.height ?? 500 }
            : null
    }

    const act = state.acts.find((entry) => entry.id === target.id)
    return act
        ? { width: act.width ?? 400, height: resolveActExpandedHeight(act.height) }
        : null
}

function resolveFocusNodePosition(state: StudioState, target: FocusTarget) {
    if (target.type === 'performer') {
        return state.performers.find((entry) => entry.id === target.id)?.position || null
    }

    return state.acts.find((entry) => entry.id === target.id)?.position || null
}

function buildFocusSnapshot(state: StudioState, target: FocusTarget): FocusSnapshot | null {
    const nodeSize = resolveFocusNodeSize(state, target)
    const nodePosition = resolveFocusNodePosition(state, target)
    if (!nodeSize || !nodePosition) {
        return null
    }

    return {
        nodeId: target.id,
        type: target.type,
        ...(target.type === 'act' ? { actId: target.id } : {}),
        nodePosition,
        nodeSize,
        hiddenPerformerIds: state.performers.filter((performer) => performer.hidden).map((performer) => performer.id),
        hiddenActIds: state.acts.filter((act) => act.hidden).map((act) => act.id),
        hiddenEditorIds: state.markdownEditors.filter((editor) => editor.hidden).map((editor) => editor.id),
        hiddenTerminalIds: [] as string[],
        assetLibraryOpen: state.isAssetLibraryOpen,
        assistantOpen: state.isAssistantOpen,
        terminalOpen: state.isTerminalOpen,
    }
}

function buildEnterFocusModeState(
    state: StudioState,
    target: FocusTarget,
    viewportSize: ViewportSize,
): Partial<StudioState> | null {
    const snapshot = buildFocusSnapshot(state, target)
    if (!snapshot) {
        return null
    }

    const focusWidth = viewportSize.width
    const focusHeight = viewportSize.height

    return {
        focusSnapshot: snapshot,
        selectedPerformerId: target.type === 'performer' ? target.id : null,
        selectedActId: target.type === 'act' ? target.id : null,
        activeChatPerformerId: target.type === 'performer' ? target.id : state.activeChatPerformerId,
        performers: state.performers.map((performer) => (
            target.type === 'performer' && performer.id === target.id
                ? { ...performer, hidden: false, position: FOCUS_WINDOW_ORIGIN, width: focusWidth, height: focusHeight }
                : { ...performer, hidden: true }
        )),
        acts: state.acts.map((act) => (
            target.type === 'act' && act.id === target.id
                ? { ...act, hidden: false, position: FOCUS_WINDOW_ORIGIN, width: focusWidth, height: focusHeight }
                : { ...act, hidden: true }
        )),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: true })),
        isAssetLibraryOpen: false,
        isAssistantOpen: false,
        isTerminalOpen: false,
        editingTarget: null,
        inspectorFocus: null,
    }
}

function resolveCurrentFocusViewportSize(state: StudioState, target: FocusTarget): ViewportSize {
    if (target.type === 'performer') {
        const performer = state.performers.find((entry) => entry.id === target.id)
        return getCanvasViewportSize(
            typeof document !== 'undefined' ? document : undefined,
            {
                width: performer?.width || 800,
                height: performer?.height || 600,
            },
        )
    }

    const act = state.acts.find((entry) => entry.id === target.id)
    return getCanvasViewportSize(
        typeof document !== 'undefined' ? document : undefined,
        {
            width: act?.width || 800,
            height: act?.height || 600,
        },
    )
}

export function buildExitFocusModeState(state: StudioState): Partial<StudioState> | null {
    const snapshot = state.focusSnapshot
    const target = resolveFocusTarget(snapshot)
    if (!snapshot || !target) return null

    if (target.type === 'performer') {
        return {
            focusSnapshot: null,
            performers: state.performers.map((performer) => (
                performer.id === target.id
                    ? {
                        ...performer,
                        position: snapshot.nodePosition || performer.position,
                        width: snapshot.nodeSize.width,
                        height: snapshot.nodeSize.height,
                        hidden: snapshot.hiddenPerformerIds.includes(performer.id),
                    }
                    : { ...performer, hidden: snapshot.hiddenPerformerIds.includes(performer.id) }
            )),
            acts: state.acts.map((act) => ({ ...act, hidden: snapshot.hiddenActIds.includes(act.id) })),
            markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: snapshot.hiddenEditorIds.includes(editor.id) })),
            isAssetLibraryOpen: snapshot.assetLibraryOpen,
            isAssistantOpen: snapshot.assistantOpen,
            isTerminalOpen: snapshot.terminalOpen,
        }
    }

    return {
        focusSnapshot: null,
        performers: state.performers.map((performer) => ({ ...performer, hidden: snapshot.hiddenPerformerIds.includes(performer.id) })),
        acts: state.acts.map((act) => (
            act.id === target.id
                ? {
                    ...act,
                    width: snapshot.nodeSize.width,
                    height: snapshot.nodeSize.height,
                    position: snapshot.nodePosition || act.position,
                    hidden: snapshot.hiddenActIds.includes(act.id),
                }
                : { ...act, hidden: snapshot.hiddenActIds.includes(act.id) }
        )),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: snapshot.hiddenEditorIds.includes(editor.id) })),
        isAssetLibraryOpen: snapshot.assetLibraryOpen,
        isAssistantOpen: snapshot.assistantOpen,
        isTerminalOpen: snapshot.terminalOpen,
    }
}

export function buildSyncFocusViewportState(
    state: StudioState,
    viewportSize: ViewportSize,
): Partial<StudioState> | null {
    const target = resolveFocusTarget(state.focusSnapshot)
    if (!target) {
        return null
    }

    if (target.type === 'performer') {
        const performer = state.performers.find((entry) => entry.id === target.id)
        if (!performer) {
            return null
        }

        const isLayoutStable = performer.position.x === 0
            && performer.position.y === 0
            && performer.width === viewportSize.width
            && performer.height === viewportSize.height
            && performer.hidden === false

        if (isLayoutStable) {
            return null
        }

        return {
            performers: state.performers.map((entry) => (
                entry.id === target.id
                    ? {
                        ...entry,
                        hidden: false,
                        position: FOCUS_WINDOW_ORIGIN,
                        width: viewportSize.width,
                        height: viewportSize.height,
                    }
                    : entry
            )),
        }
    }

    const act = state.acts.find((entry) => entry.id === target.id)
    if (!act) {
        return null
    }

    const isLayoutStable = act.position.x === 0
        && act.position.y === 0
        && act.width === viewportSize.width
        && act.height === viewportSize.height
        && act.hidden === false

    if (isLayoutStable) {
        return null
    }

    return {
        acts: state.acts.map((entry) => (
            entry.id === target.id
                ? {
                    ...entry,
                    hidden: false,
                    position: FOCUS_WINDOW_ORIGIN,
                    width: viewportSize.width,
                    height: viewportSize.height,
                }
                : entry
        )),
    }
}

export function enterFocusModeImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: FocusNodeType,
    viewportSize: ViewportSize,
) {
    const state = get()
    if (state.focusSnapshot) {
        // Prevent corrupting the root snapshot if accidentally called again.
        return
    }
    const patch = buildEnterFocusModeState(state, { id: nodeId, type: nodeType }, viewportSize)
    if (patch) {
        set(patch)
    }
}

export function exitFocusModeImpl(get: GetState, set: SetState) {
    const state = get()
    const patch = buildExitFocusModeState(state)
    if (!patch) return
    set(patch)
}

export function switchFocusTargetImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: FocusNodeType,
) {
    const state = get()
    const currentTarget = resolveFocusTarget(state.focusSnapshot)
    if (!currentTarget) return

    if (nodeId === currentTarget.id && nodeType === currentTarget.type) return

    const restoredPatch = buildExitFocusModeState(state)
    if (!restoredPatch) {
        return
    }

    const restoredState = { ...state, ...restoredPatch } as StudioState
    const viewportSize = resolveCurrentFocusViewportSize(state, currentTarget)
    const nextPatch = buildEnterFocusModeState(restoredState, { id: nodeId, type: nodeType }, viewportSize)
    if (nextPatch) {
        set(nextPatch)
    }
}

export function setWorkingDirImpl(get: GetState, set: SetState, dir: string) {
    const normalized = normalizePath(dir)
    if (!normalized) return
    setApiWorkingDirContext(normalized)
    set((state: StudioState) => ({
        workspaceId: state.workspaceList.find((entry) => entry.workingDir === normalized)?.id || null,
        workingDir: normalized,
        performers: state.performers,
        drafts: {},
        markdownEditors: [],
        editingTarget: null,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        focusSnapshot: null,
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatDrafts: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionMutationPending: {},
        sessionReverts: {},
        sessions: [],
        inspectorFocus: null,
        trackingWindow: null,
        isTrackingOpen: false,
        workspaceDirty: true,
        acts: [],
        selectedActId: null,
        actEditorState: null,
        actThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
    }))
    get().initRealtimeEvents()
    api.studio.activate(normalized).catch((error) => console.warn('[studio] activate failed', error))
}

export function addCanvasTerminalImpl(
    get: GetState,
    set: SetState,
    canvasTerminalIdCounter: { value: number },
) {
    canvasTerminalIdCounter.value++
    const id = `canvas-term-${canvasTerminalIdCounter.value}`
    const title = `Terminal ${canvasTerminalIdCounter.value}`
    const state = get()
    const spawnPosition = resolveCanvasSpawnPosition({
        canvasCenter: state.canvasCenter,
        existingCount: state.canvasTerminals.length,
        width: 600,
        height: 400,
    })
    set((state: StudioState) => ({
        canvasTerminals: [
            ...state.canvasTerminals,
            {
                id,
                title,
                position: spawnPosition,
                width: 600,
                height: 400,
                sessionId: null,
                connected: false,
            },
        ],
        workspaceDirty: true,
    }))
}

export function removeCanvasTerminalImpl(set: SetState, id: string) {
    set((state: StudioState) => ({
        canvasTerminals: state.canvasTerminals.filter((terminal) => terminal.id !== id),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalPositionImpl(set: SetState, id: string, x: number, y: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, position: { x, y } })),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalSizeImpl(set: SetState, id: string, width: number, height: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, width, height })),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalSessionImpl(set: SetState, id: string, sessionId: string | null, connected: boolean) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, sessionId, connected })),
    }))
}

export function closeTrackingWindowImpl(set: SetState) {
    set({
        isTrackingOpen: false,
        trackingWindow: null,
        workspaceDirty: true,
    })
}

export function updateTrackingWindowPositionImpl(set: SetState, x: number, y: number) {
    set((state: StudioState) => ({
        trackingWindow: state.trackingWindow
            ? { ...state.trackingWindow, position: { x, y } }
            : state.trackingWindow,
        workspaceDirty: true,
    }))
}

export function updateTrackingWindowSizeImpl(set: SetState, width: number, height: number) {
    set((state: StudioState) => ({
        trackingWindow: state.trackingWindow
            ? { ...state.trackingWindow, width, height }
            : state.trackingWindow,
        workspaceDirty: true,
    }))
}
