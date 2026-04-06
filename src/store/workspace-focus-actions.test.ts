import { describe, expect, it } from 'vitest'
import {
    ACT_DEFAULT_EXPANDED_HEIGHT,
    ACT_DEFAULT_WIDTH,
} from '../lib/act-layout'
import { createPerformerNode } from '../lib/performers'
import {
    buildExitFocusModeState,
    enterFocusModeImpl,
    exitFocusModeImpl,
    switchFocusTargetImpl,
} from './workspace-focus-actions'
import { createMarkdownEditorImpl } from './workspace-draft-actions'
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
        chatDrafts: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        sessions: [],
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
        lspServers: [],
        lspDiagnostics: {},
        adapterViewsByPerformer: {},
        isAssistantOpen: true,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
        recordStudioChange: (() => 'lazy_projection') as StudioState['recordStudioChange'],
    } as unknown as StudioState
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

    it('restores performer size from the snapshot when exiting focus mode', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'performer-1', 'performer', { width: 900, height: 700 })

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

    it('switches focus targets by restoring the baseline layout before refocusing', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'performer-1', 'performer', { width: 900, height: 700 })

        switchFocusTargetImpl(harness.get, harness.set, 'performer-2', 'performer')

        const state = harness.read()
        expect(state.focusSnapshot?.nodeId).toBe('performer-2')
        expect(state.performers.find((entry) => entry.id === 'performer-1')).toMatchObject({
            hidden: true,
            position: { x: 0, y: 0 },
            width: 320,
            height: 400,
        })
        expect(state.performers.find((entry) => entry.id === 'performer-2')).toMatchObject({
            hidden: false,
            width: 900,
            height: 700,
        })
    })

    it('switches from an act focus target back to a performer using the restored baseline state', () => {
        const harness = createStateHarness({
            ...createTestState(),
            acts: [{
                id: 'act-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: ACT_DEFAULT_WIDTH,
                height: ACT_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterFocusModeImpl(harness.get, harness.set, 'act-1', 'act', { width: 1000, height: 760 })
        switchFocusTargetImpl(harness.get, harness.set, 'performer-2', 'performer')

        const state = harness.read()
        expect(state.focusSnapshot).toMatchObject({
            nodeId: 'performer-2',
            type: 'performer',
            assetLibraryOpen: true,
            assistantOpen: true,
            terminalOpen: true,
        })
        expect(state.performers.find((entry) => entry.id === 'performer-2')).toMatchObject({
            hidden: false,
            width: 1000,
            height: 760,
        })
        expect(state.acts.find((entry) => entry.id === 'act-1')).toMatchObject({
            hidden: true,
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_EXPANDED_HEIGHT,
            position: { x: 220, y: 160 },
        })
    })

    it('builds an exit patch that restores act position and side panels', () => {
        const harness = createStateHarness({
            ...createTestState(),
            acts: [{
                id: 'act-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: ACT_DEFAULT_WIDTH,
                height: ACT_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterFocusModeImpl(harness.get, harness.set, 'act-1', 'act', { width: 1000, height: 760 })

        const patch = buildExitFocusModeState(harness.read())

        expect(patch).toMatchObject({
            focusSnapshot: null,
            isAssetLibraryOpen: true,
            isAssistantOpen: true,
            isTerminalOpen: true,
        })
        expect((patch?.acts as StudioState['acts'])[0]).toMatchObject({
            id: 'act-1',
            hidden: false,
            position: { x: 220, y: 160 },
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_EXPANDED_HEIGHT,
        })
    })

    it('exits focus mode before creating a markdown editor', () => {
        const harness = createStateHarness()
        const markdownEditorIdCounter = { value: 0 }

        enterFocusModeImpl(harness.get, harness.set, 'performer-1', 'performer', { width: 960, height: 720 })

        createMarkdownEditorImpl(
            harness.get,
            harness.set,
            markdownEditorIdCounter,
            (prefix) => `${prefix}-1`,
            'tal',
        )

        const state = harness.read()
        expect(state.focusSnapshot).toBeNull()
        expect(state.selectedMarkdownEditorId).toBe('markdown-editor-1')
        expect(state.isAssetLibraryOpen).toBe(true)
        expect(state.isAssistantOpen).toBe(true)
        expect(state.isTerminalOpen).toBe(true)
        expect(state.performers.find((entry) => entry.id === 'performer-1')).toMatchObject({
            hidden: false,
            width: 320,
            height: 400,
        })
        expect(state.markdownEditors).toHaveLength(1)
        expect(state.markdownEditors[0]).toMatchObject({
            id: 'markdown-editor-1',
            hidden: false,
        })
    })
})
