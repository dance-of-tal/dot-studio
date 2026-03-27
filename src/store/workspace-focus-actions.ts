import { api, setApiWorkingDirContext } from '../api'
import { resolveActExpandedHeight } from '../lib/act-layout'
import { getCanvasViewportSize, resolveFocusNodeId } from '../lib/focus-utils'
import { normalizePath, mapCanvasTerminals } from './workspace-helpers'
import type { StudioState } from './types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function enterFocusModeImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: 'performer' | 'act',
    viewportSize: { width: number; height: number },
) {
    const state = get()
    if (state.focusSnapshot) {
        // Prevent corrupting the root snapshot if accidentally called again.
        return
    }
    // No padding — focused node fills the entire canvas viewport
    const focusWidth = viewportSize.width
    const focusHeight = viewportSize.height

    const focusSnapshotBase = {
        nodeId,
        hiddenPerformerIds: state.performers.filter((performer) => performer.hidden).map((performer) => performer.id),
        hiddenActIds: state.acts.filter((act) => act.hidden).map((act) => act.id),
        hiddenEditorIds: state.markdownEditors.filter((editor) => editor.hidden).map((editor) => editor.id),
        hiddenTerminalIds: [] as string[],
        assetLibraryOpen: state.isAssetLibraryOpen,
        assistantOpen: state.isAssistantOpen,
        terminalOpen: state.isTerminalOpen,
    }

    if (nodeType === 'performer') {
        const performer = state.performers.find((entry) => entry.id === nodeId)
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
            performers: state.performers.map((entry) => (
                entry.id === nodeId
                    ? { ...entry, hidden: false, width: focusWidth, height: focusHeight }
                    : { ...entry, hidden: true }
            )),
            acts: state.acts.map((act) => ({ ...act, hidden: true })),
            markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: true })),
            isAssetLibraryOpen: false,
            isAssistantOpen: false,
            isTerminalOpen: false,
            editingTarget: null,
            inspectorFocus: null,
        })
        return
    }

    const act = state.acts.find((entry) => entry.id === nodeId)
    if (!act) return

    set({
        focusedPerformerId: nodeId,
        focusedNodeType: 'act',
        focusSnapshot: {
            ...focusSnapshotBase,
            type: 'act',
            actId: nodeId,
            nodeSize: { width: act.width ?? 400, height: resolveActExpandedHeight(act.height) },
            nodePosition: act.position,
        },
        selectedActId: nodeId,
        selectedPerformerId: null,
        performers: state.performers.map((performer) => ({ ...performer, hidden: true })),
        acts: state.acts.map((entry) => (
            entry.id === nodeId
                ? { ...entry, hidden: false, width: focusWidth, height: focusHeight, position: { x: 0, y: 0 } }
                : { ...entry, hidden: true }
        )),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: true })),
        isAssetLibraryOpen: false,
        isAssistantOpen: false,
        isTerminalOpen: false,
        editingTarget: null,
        inspectorFocus: null,
    })
}

export function exitFocusModeImpl(get: GetState, set: SetState) {
    const state = get()
    const snapshot = state.focusSnapshot
    if (!snapshot) return

    // focusedPerformerId may have been cleared by selectAct / selectPerformer
    const focusedId = resolveFocusNodeId(snapshot, state.focusedPerformerId)
    const focusedType = state.focusedNodeType || snapshot.type

    if (focusedType === 'performer') {
        set({
            focusedPerformerId: null,
            focusedNodeType: null,
            focusSnapshot: null,
            performers: state.performers.map((performer) => (
                performer.id === focusedId
                    ? {
                        ...performer,
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
        })
        return
    }

    set({
        focusedPerformerId: null,
        focusedNodeType: null,
        focusSnapshot: null,
        performers: state.performers.map((performer) => ({ ...performer, hidden: snapshot.hiddenPerformerIds.includes(performer.id) })),
        acts: state.acts.map((act) => (
            act.id === focusedId
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
    })
}

export function switchFocusTargetImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: 'performer' | 'act',
) {
    const state = get()
    const snapshot = state.focusSnapshot
    const prevId = resolveFocusNodeId(snapshot, state.focusedPerformerId)
    if (!snapshot || !prevId) return

    const prevType = state.focusedNodeType || snapshot.type

    if (nodeId === prevId && nodeType === prevType) return

    const prevNodes = prevType === 'performer' ? state.performers : state.acts
    const prev = prevNodes.find((node) => node.id === prevId)
    const { width: focusWidth, height: focusHeight } = getCanvasViewportSize(
        typeof document !== 'undefined' ? document : undefined,
        {
            width: prev?.width || 800,
            height: prev?.height || 600,
        },
    )

    if (nodeType === 'performer') {
        const nextNode = state.performers.find((performer) => performer.id === nodeId)
        if (!nextNode) return

        set({
            focusedPerformerId: nodeId,
            focusedNodeType: 'performer',
            selectedPerformerId: nodeId,
            selectedActId: null,
            activeChatPerformerId: nodeId,
            focusSnapshot: {
                ...snapshot,
                nodeId,
                type: 'performer',
                nodeSize: { width: nextNode.width ?? 400, height: nextNode.height ?? 500 },
            },
            performers: state.performers.map((performer) => {
                if (performer.id === prevId && prevType === 'performer') {
                    return { ...performer, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
                }
                if (performer.id === nodeId) {
                    return { ...performer, hidden: false, width: focusWidth, height: focusHeight }
                }
                return { ...performer, hidden: true }
            }),
            acts: state.acts.map((act) => {
                if (act.id === prevId && prevType === 'act') {
                    return { ...act, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
                }
                return { ...act, hidden: true }
            }),
        })
        return
    }

    const nextAct = state.acts.find((act) => act.id === nodeId)
    if (!nextAct) return

    set({
        focusedPerformerId: nodeId,
        focusedNodeType: 'act',
        selectedActId: nodeId,
        selectedPerformerId: null,
        focusSnapshot: {
            ...snapshot,
            nodeId,
            type: 'act',
            actId: nodeId,
            nodeSize: { width: nextAct.width ?? 400, height: resolveActExpandedHeight(nextAct.height) },
            nodePosition: nextAct.position,
        },
        performers: state.performers.map((performer) => {
            if (performer.id === prevId && prevType === 'performer') {
                return { ...performer, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
            }
            return { ...performer, hidden: true }
        }),
        acts: state.acts.map((act) => {
            if (act.id === prevId && prevType === 'act') {
                return {
                    ...act,
                    width: snapshot.nodeSize.width,
                    height: snapshot.nodeSize.height,
                    position: snapshot.nodePosition || act.position,
                    hidden: true,
                }
            }
            if (act.id === nodeId) {
                return { ...act, hidden: false, width: focusWidth, height: focusHeight, position: { x: 0, y: 0 } }
            }
            return { ...act, hidden: true }
        }),
    })
}

export function setWorkingDirImpl(get: GetState, set: SetState, dir: string) {
    const normalized = normalizePath(dir)
    if (!normalized) return
    setApiWorkingDirContext(normalized)
    set((state: StudioState) => ({
        workspaceId: state.workspaceList.find((entry) => entry.workingDir === normalized)?.id || null,
        workingDir: normalized,
        performers: state.performers.map((performer) => ({
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
    set: SetState,
    canvasTerminalIdCounter: { value: number },
) {
    canvasTerminalIdCounter.value++
    const id = `canvas-term-${canvasTerminalIdCounter.value}`
    const title = `Terminal ${canvasTerminalIdCounter.value}`
    set((state: StudioState) => ({
        canvasTerminals: [
            ...state.canvasTerminals,
            {
                id,
                title,
                position: {
                    x: 200 + (state.canvasTerminals.length * 30),
                    y: 200 + (state.canvasTerminals.length * 20),
                },
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
