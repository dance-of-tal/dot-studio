import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import type { StudioState } from './types'
import { newWorkspace } from './workspace-operations'

function createWorkspaceState(): StudioState {
    return {
        workspaceId: 'workspace-old',
        workspaceList: [],
        workingDir: '/tmp/old-workspace',
        performers: [],
        acts: [],
        drafts: {},
        markdownEditors: [],
        canvasTerminals: [{
            id: 'canvas-term-1',
            title: 'Terminal 1',
            position: { x: 160, y: 120 },
            width: 640,
            height: 420,
            sessionId: 'sess-old',
            connected: true,
        }],
        editingTarget: null,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        focusedPerformerId: null,
        focusedNodeType: null,
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceDirty: false,
        runtimeReloadPending: false,
        theme: 'dark',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isAssetLibraryOpen: false,
        trackingWindow: null,
        canvasCenter: null,
        layoutActId: null,
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
        selectedActId: null,
        actEditorState: null,
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
        historyCursors: {},
        sessionReverts: {},
        cleanupRealtimeEvents: vi.fn(),
        initRealtimeEvents: vi.fn(),
        loadDraftsFromDisk: vi.fn(),
        loadWorkspace: vi.fn(),
    } as unknown as StudioState
}

function createHarness(initialState = createWorkspaceState()) {
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

describe('workspace operations', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('clears canvas terminals when opening a brand-new workspace', async () => {
        const harness = createHarness()

        vi.spyOn(api.studio, 'pickDirectory').mockResolvedValue({ path: '/tmp/new-workspace' })
        vi.spyOn(api.workspaces, 'list').mockResolvedValue([])
        vi.spyOn(api.studio, 'activate').mockResolvedValue({ ok: true, activeProjectDir: '/tmp/new-workspace' })

        await newWorkspace(harness.get, harness.set)

        expect(harness.read().workingDir).toBe('/tmp/new-workspace')
        expect(harness.read().canvasTerminals).toEqual([])
        expect(harness.read().trackingWindow).toBeNull()
        expect(harness.read().workspaceDirty).toBe(true)
    })
})
