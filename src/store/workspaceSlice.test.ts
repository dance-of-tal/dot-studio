import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from './types'
import { createWorkspaceSlice } from './workspaceSlice'
import { createEmptyProjectionDirtyState } from './runtime-change-policy'

const { applyRuntimeReloadMock, deleteSessionMock, showToastMock, setHiddenMock, updateConfigMock } = vi.hoisted(() => ({
    applyRuntimeReloadMock: vi.fn(),
    deleteSessionMock: vi.fn(),
    showToastMock: vi.fn(),
    setHiddenMock: vi.fn(),
    updateConfigMock: vi.fn(),
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
        workspaces: {
            setHidden: setHiddenMock,
        },
        studio: { updateConfig: updateConfigMock },
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
        selectedActId: null,
        actEditorState: null,
        acts: [],
        actThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
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
        setHiddenMock.mockReset().mockResolvedValue({ ok: true, id: 'workspace-1', hiddenFromList: true })
        updateConfigMock.mockReset().mockResolvedValue({ ok: true })
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

    it('treats act-only changes as hot and leaves projection dirtiness untouched', () => {
        const harness = createHarness({
            ...createBaseState(),
            runtimeReloadPending: false,
        } as StudioState)

        const result = harness.get().recordStudioChange({
            kind: 'act',
            actIds: ['act-1'],
            workspaceWide: true,
        })

        expect(result).toBe('hot')
        expect(harness.get().runtimeReloadPending).toBe(false)
        expect(harness.get().projectionDirty).toEqual(createEmptyProjectionDirtyState())
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

    it('hides a non-active workspace from the list without resetting the current workspace state', async () => {
        const listWorkspaces = vi.fn(async () => {})
        const cleanupRealtimeEvents = vi.fn()
        const harness = createHarness({
            ...createBaseState(),
            workspaceId: 'workspace-1',
            workingDir: '/tmp/workspace-a',
            listWorkspaces,
            cleanupRealtimeEvents,
        } as StudioState)

        await harness.get().closeWorkspace('workspace-2')

        expect(setHiddenMock).toHaveBeenCalledWith('workspace-2', true)
        expect(listWorkspaces).toHaveBeenCalled()
        expect(cleanupRealtimeEvents).not.toHaveBeenCalled()
        expect(harness.get().workspaceId).toBe('workspace-1')
        expect(harness.get().workingDir).toBe('/tmp/workspace-a')
        expect(updateConfigMock).not.toHaveBeenCalled()
    })
})

describe('workspace visibility toggles', () => {
    it('keeps focus mode active when toggling another performer visibility', () => {
        const harness = createHarness({
            ...createBaseState(),
            performers: [
                {
                    id: 'performer-1',
                    name: 'Alpha',
                    position: { x: 0, y: 0 },
                    width: 960,
                    height: 720,
                    hidden: false,
                    scope: 'shared',
                    model: null,
                    talRef: null,
                    danceRefs: [],
                    mcpServerNames: [],
                },
                {
                    id: 'performer-2',
                    name: 'Beta',
                    position: { x: 220, y: 0 },
                    width: 320,
                    height: 400,
                    hidden: true,
                    scope: 'shared',
                    model: null,
                    talRef: null,
                    danceRefs: [],
                    mcpServerNames: [],
                },
            ],
            focusSnapshot: {
                nodeId: 'performer-1',
                type: 'performer',
                nodePosition: { x: 0, y: 0 },
                nodeSize: { width: 320, height: 400 },
                hiddenPerformerIds: [],
                hiddenActIds: [],
                hiddenEditorIds: [],
                hiddenTerminalIds: [],
                assetLibraryOpen: true,
                assistantOpen: false,
                terminalOpen: false,
            },
        } as StudioState)

        harness.get().togglePerformerVisibility('performer-2')

        expect(harness.get().focusSnapshot).toMatchObject({
            nodeId: 'performer-1',
            hiddenPerformerIds: ['performer-2'],
        })
        expect(harness.get().performers.find((entry) => entry.id === 'performer-2')?.hidden).toBe(true)
    })
})
