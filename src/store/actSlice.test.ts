import { describe, expect, it } from 'vitest'
import type { StudioState } from './types'
import { createActSlice } from './actSlice'
import { createEmptyProjectionDirtyState } from './runtime-change-policy'

function overlaps(
    left: { x: number; y: number; width: number; height: number },
    right: { x: number; y: number; width: number; height: number },
) {
    return !(
        left.x + left.width <= right.x
        || right.x + right.width <= left.x
        || left.y + left.height <= right.y
        || right.y + right.height <= left.y
    )
}

function createBaseState(): StudioState {
    return {
        workspaceId: 'workspace-1',
        performers: [{
            id: 'performer-1',
            name: 'Researcher',
            position: { x: 840, y: 500 },
            width: 320,
            height: 400,
            scope: 'shared',
            model: null,
            talRef: null,
            danceRefs: [],
            mcpServerNames: [],
        }],
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
        theme: 'light',
        workingDir: '/tmp/workspace',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isAssetLibraryOpen: false,
        canvasTerminals: [],
        trackingWindow: null,
        canvasCenter: { x: 1000, y: 700 },
        layoutActId: null,
        chatDrafts: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        sessions: [],
        lspServers: [],
        lspDiagnostics: {},
        selectedActId: null,
        actEditorState: null,
        acts: [],
        actThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
        adapterViewsByPerformer: {},
        isAssistantOpen: false,
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
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionReverts: {},
        clearSessionData: () => {},
        unregisterBinding: () => {},
        clearChatDraftMessages: () => {},
        clearChatPrefixMessages: () => {},
        removeSession: () => {},
        listSessions: async () => {},
        recordStudioChange: () => 'hot',
    } as unknown as StudioState
}

function createHarness(base: StudioState = createBaseState()) {
    let state = base
    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }
    const get = () => state
    const slice = createActSlice(set, get, {} as never)
    state = { ...slice, ...state } as StudioState
    return {
        get: () => state,
    }
}

describe('actSlice', () => {
    it('spawns a new act without overlapping an existing performer window', () => {
        const harness = createHarness()

        const actId = harness.get().addAct('Review Flow')
        const act = harness.get().acts.find((entry) => entry.id === actId)

        expect(act).toBeTruthy()
        expect(overlaps(
            {
                x: act!.position.x,
                y: act!.position.y,
                width: act!.width,
                height: act!.height,
            },
            {
                x: 840,
                y: 500,
                width: 320,
                height: 400,
            },
        )).toBe(false)
        expect(harness.get().canvasRevealTarget).toMatchObject({
            id: actId,
            type: 'act',
        })
    })
})
