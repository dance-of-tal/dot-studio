import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from './types'
import { createWorkspaceSlice } from './workspaceSlice'
import { createEmptyProjectionDirtyState } from './runtime-change-policy'

const { applyRuntimeReloadMock, deleteSessionMock, showToastMock } = vi.hoisted(() => ({
    applyRuntimeReloadMock: vi.fn(),
    deleteSessionMock: vi.fn(),
    showToastMock: vi.fn(),
}))

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

vi.mock('../api', () => ({
    api: {
        opencodeApplyRuntimeReload: applyRuntimeReloadMock,
        chat: {
            deleteSession: deleteSessionMock,
        },
        studio: { updateConfig: vi.fn() },
    },
    setApiWorkingDirContext: vi.fn(),
}))

vi.mock('../lib/toast', () => ({
    showToast: showToastMock,
}))

function createBaseState(): StudioState {
    return {
        workspaceId: 'workspace-1',
        performers: [],
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
        runtimeReloadPending: true,
        theme: 'light',
        workingDir: '/tmp/workspace',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isAssetLibraryOpen: false,
        canvasTerminals: [],
        trackingWindow: null,
        canvasCenter: null,
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
        clearSessionData: vi.fn(),
        unregisterBinding: vi.fn(),
        clearChatDraftMessages: vi.fn(),
        clearChatPrefixMessages: vi.fn(),
        removeSession: vi.fn(),
        listSessions: vi.fn(async () => {}),
    } as unknown as StudioState
}

function createHarness(base: StudioState = createBaseState()) {
    let state = base
    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }
    const get = () => state
    const slice = createWorkspaceSlice(set, get, {} as never)
    state = { ...slice, ...state } as StudioState
    return {
        get: () => state,
    }
}

describe('workspace runtime reload', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        applyRuntimeReloadMock.mockReset()
        deleteSessionMock.mockReset()
        showToastMock.mockReset()
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => 'light'),
            setItem: vi.fn(),
        })
    })

    it('retries once when the server briefly reports a finished run as still blocked', async () => {
        const harness = createHarness()
        applyRuntimeReloadMock
            .mockResolvedValueOnce({
                applied: false,
                blocked: true,
                runningSessions: 1,
                disposedDirectories: [],
            })
            .mockResolvedValueOnce({
                applied: true,
                blocked: false,
                runningSessions: 0,
                disposedDirectories: ['/tmp/workspace'],
            })

        const promise = harness.get().applyPendingRuntimeReload()
        await vi.advanceTimersByTimeAsync(350)

        await expect(promise).resolves.toBe(true)
        expect(applyRuntimeReloadMock).toHaveBeenCalledTimes(2)
        expect(harness.get().runtimeReloadPending).toBe(false)
    })

    it('records lazy projection changes without setting runtime reload pending', () => {
        const harness = createHarness({
            ...createBaseState(),
            runtimeReloadPending: false,
        } as StudioState)

        const result = harness.get().recordStudioChange({
            kind: 'performer',
            performerIds: ['performer-1'],
            draftIds: ['tal-draft-1'],
        })

        expect(result).toBe('lazy_projection')
        expect(harness.get().runtimeReloadPending).toBe(false)
        expect(harness.get().projectionDirty).toEqual({
            performerIds: ['performer-1'],
            actIds: [],
            draftIds: ['tal-draft-1'],
            workspaceWide: false,
        })
    })

    it('spawns a new performer without overlapping an existing act window', () => {
        const harness = createHarness({
            ...createBaseState(),
            canvasCenter: { x: 1000, y: 700 },
            acts: [{
                id: 'act-1',
                name: 'Existing Act',
                position: { x: 840, y: 300 },
                width: 640,
                height: 800,
                participants: {},
                relations: [],
                createdAt: Date.now(),
            }],
        } as StudioState)

        const performerId = harness.get().addPerformer('New Performer')
        const performer = harness.get().performers.find((entry) => entry.id === performerId)

        expect(performer).toBeTruthy()
        expect(overlaps(
            {
                x: performer!.position.x,
                y: performer!.position.y,
                width: performer!.width || 320,
                height: performer!.height || 400,
            },
            {
                x: 840,
                y: 300,
                width: 640,
                height: 800,
            },
        )).toBe(false)
        expect(harness.get().canvasRevealTarget).toMatchObject({
            id: performerId,
            type: 'performer',
        })
    })

    it('deletes a bound performer session when removing the performer', async () => {
        deleteSessionMock.mockResolvedValue(undefined)
        const removeSession = vi.fn()
        const clearSessionData = vi.fn()
        const unregisterBinding = vi.fn()
        const clearChatDraftMessages = vi.fn()
        const clearChatPrefixMessages = vi.fn()
        const listSessions = vi.fn(async () => {})

        const harness = createHarness({
            ...createBaseState(),
            performers: [{
                id: 'performer-1',
                name: 'Performer 1',
                position: { x: 0, y: 0 },
                scope: 'shared',
                model: null,
                talRef: null,
                danceRefs: [],
                mcpServerNames: [],
            }],
            sessions: [{ id: 'session-1', title: 'Performer 1' }],
            chatKeyToSession: { 'performer-1': 'session-1' },
            sessionToChatKey: { 'session-1': 'performer-1' },
            clearSessionData,
            unregisterBinding,
            clearChatDraftMessages,
            clearChatPrefixMessages,
            removeSession,
            listSessions,
        } as StudioState)

        harness.get().removePerformer('performer-1')
        await Promise.resolve()
        await Promise.resolve()

        expect(deleteSessionMock).toHaveBeenCalledWith('session-1')
        expect(clearSessionData).toHaveBeenCalledWith('session-1')
        expect(unregisterBinding).toHaveBeenCalledWith('performer-1')
        expect(removeSession).toHaveBeenCalledWith('session-1')
    })
})
