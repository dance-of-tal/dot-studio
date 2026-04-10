import { describe, expect, it } from 'vitest'
import type { StudioState } from './types'
import { createActSlice } from './actSlice'
import { createEmptyProjectionDirtyState } from './runtime-change-policy'
import type { WorkspaceAct } from '../types'

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

    it('keeps focus mode active when toggling another act visibility', () => {
        const harness = createHarness({
            ...createBaseState(),
            acts: [
                {
                    id: 'act-1',
                    name: 'Focused Act',
                    position: { x: 100, y: 120 },
                    width: 960,
                    height: 720,
                    participants: {},
                    relations: [],
                    createdAt: Date.now(),
                    hidden: false,
                },
                {
                    id: 'act-2',
                    name: 'Hidden Target',
                    position: { x: 520, y: 120 },
                    width: 640,
                    height: 800,
                    participants: {},
                    relations: [],
                    createdAt: Date.now(),
                    hidden: true,
                },
            ],
            focusSnapshot: {
                nodeId: 'act-1',
                type: 'act',
                nodePosition: { x: 100, y: 120 },
                nodeSize: { width: 640, height: 800 },
                hiddenPerformerIds: [],
                hiddenActIds: [],
                hiddenEditorIds: [],
                hiddenTerminalIds: [],
                assetLibraryOpen: false,
                assistantOpen: false,
                terminalOpen: false,
            },
        } as StudioState)

        harness.get().toggleActVisibility('act-2')

        expect(harness.get().focusSnapshot).toMatchObject({
            nodeId: 'act-1',
            hiddenActIds: ['act-2'],
        })
        expect(harness.get().acts.find((entry) => entry.id === 'act-2')?.hidden).toBe(true)
    })

    it('preserves the active participant when selecting a different thread', () => {
        const threadAct: WorkspaceAct = {
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                alpha: {
                    performerRef: { kind: 'draft', draftId: 'performer-1' },
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        }

        const harness = createHarness({
            ...createBaseState(),
            acts: [threadAct],
            selectedActId: 'act-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        } as StudioState)

        harness.get().selectThread('act-1', 'thread-2')
        expect(harness.get().activeThreadParticipantKey).toBe('alpha')

        harness.get().selectThreadParticipant(null)
        expect(harness.get().activeThreadParticipantKey).toBeNull()
    })
})
