import { describe, expect, it } from 'vitest'
import { createPerformerNode } from '../lib/performers'
import {
    enterFocusModeImpl,
    exitFocusModeImpl,
    switchFocusTargetImpl,
} from './workspace-focus-actions'
import type { StudioState } from './types'

function createTestState(): StudioState {
    return {
        performers: [
            createPerformerNode({ id: 'performer-1', name: 'Alpha', x: 0, y: 0 }),
            createPerformerNode({ id: 'performer-2', name: 'Beta', x: 240, y: 0 }),
        ],
        acts: [],
        markdownEditors: [],
        drafts: {},
        workingDir: '',
        workspaceId: null,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        focusedPerformerId: null,
        focusedNodeType: null,
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceList: [],
        workspaceDirty: false,
        theme: 'dark',
        isTerminalOpen: true,
        isTrackingOpen: false,
        isAssetLibraryOpen: true,
        canvasTerminals: [],
        trackingWindow: null,
        canvasCenter: null,
        layoutActId: null,
        editingTarget: null,
        selectedActId: null,
        actEditorState: null,
        actThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
        chats: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        sessionMap: {},
        loadingPerformerId: null,
        sessions: [],
        pendingPermissions: {},
        pendingQuestions: {},
        todos: {},
        lspServers: [],
        lspDiagnostics: {},
        adapterViewsByPerformer: {},
        safeSummaries: {},
        isAssistantOpen: true,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
    } as StudioState
}

function createStateHarness(initialState = createTestState()) {
    let state = initialState

    return {
        get: () => state,
        set: (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            const nextPartial = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...nextPartial }
        },
        read: () => state,
    }
}

describe('workspace focus actions', () => {
    it('records the focused node id and closes side panels when entering performer focus', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'performer-1', 'performer', { width: 900, height: 700 })

        const state = harness.read()
        expect(state.focusSnapshot?.nodeId).toBe('performer-1')
        expect(state.focusSnapshot?.type).toBe('performer')
        expect(state.isAssetLibraryOpen).toBe(false)
        expect(state.isAssistantOpen).toBe(false)
        expect(state.isTerminalOpen).toBe(false)
        expect(state.performers.find((entry) => entry.id === 'performer-1')).toMatchObject({
            hidden: false,
            width: 900,
            height: 700,
        })
        expect(state.performers.find((entry) => entry.id === 'performer-2')?.hidden).toBe(true)
    })

    it('restores performer size from snapshot even if focusedPerformerId was cleared', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'performer-1', 'performer', { width: 900, height: 700 })
        harness.set({ focusedPerformerId: null })

        exitFocusModeImpl(harness.get, harness.set)

        const state = harness.read()
        expect(state.focusSnapshot).toBeNull()
        expect(state.performers.find((entry) => entry.id === 'performer-1')).toMatchObject({
            hidden: false,
            width: 320,
            height: 400,
        })
        expect(state.isAssetLibraryOpen).toBe(true)
        expect(state.isAssistantOpen).toBe(true)
        expect(state.isTerminalOpen).toBe(true)
    })

    it('switches focus targets using the snapshot node id when the focused id is stale', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'performer-1', 'performer', { width: 900, height: 700 })
        harness.set({ focusedPerformerId: null })

        switchFocusTargetImpl(harness.get, harness.set, 'performer-2', 'performer')

        const state = harness.read()
        expect(state.focusSnapshot?.nodeId).toBe('performer-2')
        expect(state.focusedPerformerId).toBe('performer-2')
        expect(state.performers.find((entry) => entry.id === 'performer-1')).toMatchObject({
            hidden: true,
            width: 320,
            height: 400,
        })
        expect(state.performers.find((entry) => entry.id === 'performer-2')).toMatchObject({
            hidden: false,
            width: 900,
            height: 700,
        })
    })
})
