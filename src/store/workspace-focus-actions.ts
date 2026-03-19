import { api, setApiWorkingDirContext } from '../api'
import { normalizePath, mapCanvasTerminals } from './workspace-helpers'
import type { StudioState } from './types'

type SetState = (partial: any) => void
type GetState = () => StudioState

export function enterFocusModeImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: 'performer' | 'act',
    viewportSize: { width: number; height: number },
) {
    const state = get()
    const FOCUS_PADDING = 48
    const focusWidth = viewportSize.width - FOCUS_PADDING
    const focusHeight = viewportSize.height - FOCUS_PADDING

    const focusSnapshotBase = {
        hiddenPerformerIds: state.performers.filter((performer) => performer.hidden).map((performer) => performer.id),
        hiddenActIds: state.acts.filter((act) => (act as any).hidden).map((act) => act.id),
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
            nodeSize: { width: act.width ?? 400, height: act.height ?? 420 },
        },
        selectedActId: nodeId,
        selectedPerformerId: null,
        performers: state.performers.map((performer) => ({ ...performer, hidden: true })),
        acts: state.acts.map((entry) => (
            entry.id === nodeId
                ? { ...entry, hidden: false, width: focusWidth, height: focusHeight }
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
    if (!snapshot || !state.focusedPerformerId) return

    const focusedId = state.focusedPerformerId
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
    if (!snapshot || !state.focusedPerformerId) return

    const prevId = state.focusedPerformerId
    const prevType = state.focusedNodeType || snapshot.type

    if (nodeId === prevId && nodeType === prevType) return

    let focusWidth = 800
    let focusHeight = 600
    if (prevType === 'performer') {
        const prev = state.performers.find((performer) => performer.id === prevId)
        focusWidth = prev?.width || 800
        focusHeight = prev?.height || 600
    } else {
        const prev = state.acts.find((act) => act.id === prevId)
        focusWidth = prev?.width || 800
        focusHeight = prev?.height || 600
    }

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
            type: 'act',
            actId: nodeId,
            nodeSize: { width: nextAct.width ?? 400, height: nextAct.height ?? 420 },
        },
        performers: state.performers.map((performer) => {
            if (performer.id === prevId && prevType === 'performer') {
                return { ...performer, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
            }
            return { ...performer, hidden: true }
        }),
        acts: state.acts.map((act) => {
            if (act.id === prevId && prevType === 'act') {
                return { ...act, width: snapshot.nodeSize.width, height: snapshot.nodeSize.height, hidden: true }
            }
            if (act.id === nodeId) {
                return { ...act, hidden: false, width: focusWidth, height: focusHeight }
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
        stageId: state.stageList.find((entry) => entry.workingDir === normalized)?.id || null,
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
        stageDirty: true,
    }))
}

export function removeCanvasTerminalImpl(set: SetState, id: string) {
    set((state: StudioState) => ({
        canvasTerminals: state.canvasTerminals.filter((terminal) => terminal.id !== id),
        stageDirty: true,
    }))
}

export function updateCanvasTerminalPositionImpl(set: SetState, id: string, x: number, y: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, position: { x, y } })),
        stageDirty: true,
    }))
}

export function updateCanvasTerminalSizeImpl(set: SetState, id: string, width: number, height: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, width, height })),
        stageDirty: true,
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
        stageDirty: true,
    })
}

export function updateTrackingWindowPositionImpl(set: SetState, x: number, y: number) {
    set((state: StudioState) => ({
        trackingWindow: state.trackingWindow
            ? { ...state.trackingWindow, position: { x, y } }
            : state.trackingWindow,
        stageDirty: true,
    }))
}

export function updateTrackingWindowSizeImpl(set: SetState, width: number, height: number) {
    set((state: StudioState) => ({
        trackingWindow: state.trackingWindow
            ? { ...state.trackingWindow, width, height }
            : state.trackingWindow,
        stageDirty: true,
    }))
}
