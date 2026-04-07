import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from './types'
import { createIntegrationSlice } from './integrationSlice'

type FakeEventSource = {
    onmessage: ((event: { data: string }) => void) | null
    onerror: (() => void) | null
    close: ReturnType<typeof vi.fn>
}

const {
    chatEventsMock,
    adapterEventsMock,
    listPendingPermissionsMock,
    resolveSessionMock,
    chatMessagesMock,
    statusMock,
    lspStatusMock,
    compileMock,
    currentSources,
} = vi.hoisted(() => ({
    chatEventsMock: vi.fn(),
    adapterEventsMock: vi.fn(),
    listPendingPermissionsMock: vi.fn(),
    resolveSessionMock: vi.fn(),
    chatMessagesMock: vi.fn(),
    statusMock: vi.fn(),
    lspStatusMock: vi.fn(),
    compileMock: vi.fn(),
    currentSources: {
        chat: null as FakeEventSource | null,
        adapter: null as FakeEventSource | null,
    },
}))

vi.mock('../api', () => ({
    api: {
        chat: {
            events: chatEventsMock,
            listPendingPermissions: listPendingPermissionsMock,
            resolveSession: resolveSessionMock,
            messages: chatMessagesMock,
            status: statusMock,
        },
        adapter: {
            events: adapterEventsMock,
        },
        lsp: {
            status: lspStatusMock,
        },
        compile: compileMock,
    },
}))

function createFakeEventSource(): FakeEventSource {
    return {
        onmessage: null,
        onerror: null,
        close: vi.fn(),
    }
}

function emitEvent(source: FakeEventSource | null, payload: unknown) {
    source?.onmessage?.({ data: JSON.stringify(payload) })
}

function createBaseState(loadThreads: ReturnType<typeof vi.fn>): StudioState {
    return {
        workingDir: '/tmp/workspace',
        performers: [],
        acts: [],
        actThreads: {
            'act-1': [{
                id: 'thread-1',
                actId: 'act-1',
                status: 'idle',
                participantSessions: {},
                participantStatuses: {},
                createdAt: 1,
            }],
        },
        activeThreadId: 'thread-1',
        activeThreadParticipantKey: null,
        sessions: [],
        lspServers: [],
        lspDiagnostics: {},
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatDrafts: {},
        chatPrefixes: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionReverts: {},
        runtimeReloadPending: false,
        adapterViewsByPerformer: {},
        workspaceId: 'workspace-1',
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
        projectionDirty: {
            performerIds: [],
            actIds: [],
            draftIds: [],
            workspaceWide: false,
        },
        theme: 'light',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isAssetLibraryOpen: false,
        canvasTerminals: [],
        trackingWindow: null,
        canvasCenter: null,
        layoutActId: null,
        selectedActId: null,
        actEditorState: null,
        isAssistantOpen: false,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
        upsertAdapterViewProjection: vi.fn(),
        clearAdapterViewsForPerformer: vi.fn(),
        loadThreads,
        applyPendingRuntimeReload: vi.fn(async () => false),
        registerBinding: vi.fn(),
        upsertSession: vi.fn(),
        clearChatDraftMessages: vi.fn(),
        setSessionMessages: vi.fn(),
        setSessionLoading: vi.fn(),
        setSessionStatus: vi.fn(),
    } as unknown as StudioState
}

function createHarness(loadThreads: ReturnType<typeof vi.fn>) {
    let state = createBaseState(loadThreads)
    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }
    const get = () => state

    state.registerBinding = vi.fn((chatKey: string, sessionId: string) => {
        state.chatKeyToSession[chatKey] = sessionId
        state.sessionToChatKey[sessionId] = chatKey
    })
    state.upsertSession = vi.fn((session) => {
        state.seEntities[session.id] = session
    })
    state.clearChatDraftMessages = vi.fn((chatKey: string) => {
        delete state.chatDrafts[chatKey]
    })
    state.setSessionMessages = vi.fn((sessionId: string, messages) => {
        state.seMessages[sessionId] = messages
    })
    state.setSessionLoading = vi.fn((sessionId: string, loading: boolean) => {
        if (loading) {
            state.sessionLoading[sessionId] = true
            return
        }
        delete state.sessionLoading[sessionId]
    })
    state.setSessionStatus = vi.fn((sessionId: string, status) => {
        state.seStatuses[sessionId] = status
    })

    state = {
        ...state,
        ...createIntegrationSlice(set, get, {} as never),
    }

    return {
        get: () => state,
    }
}

let rafCallbacks: Array<() => void> = []

function flushRAF() {
    const callbacks = [...rafCallbacks]
    rafCallbacks = []
    for (const callback of callbacks) {
        callback()
    }
}

describe('integrationSlice act participant sync', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        rafCallbacks = []
        currentSources.chat = null
        currentSources.adapter = null

        vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
            rafCallbacks.push(callback)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())

        chatEventsMock.mockReset().mockImplementation(() => {
            const source = createFakeEventSource()
            currentSources.chat = source
            return source as unknown as EventSource
        })
        adapterEventsMock.mockReset().mockImplementation(() => {
            const source = createFakeEventSource()
            currentSources.adapter = source
            return source as unknown as EventSource
        })
        listPendingPermissionsMock.mockReset().mockResolvedValue([])
        resolveSessionMock.mockReset().mockResolvedValue({ found: false })
        chatMessagesMock.mockReset().mockResolvedValue({
            messages: [
                {
                    id: 'msg-1',
                    info: {
                        id: 'msg-1',
                        role: 'assistant',
                        time: { created: 1000 },
                    },
                    parts: [
                        {
                            id: 'part-1',
                            type: 'text',
                            text: 'Auto-wake reply',
                        },
                    ],
                },
            ],
            nextCursor: null,
        })
        statusMock.mockReset().mockResolvedValue({ status: { type: 'idle' } })
        lspStatusMock.mockReset().mockResolvedValue([])
        compileMock.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('hydrates act participant bindings and history from server thread updates', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'act:act-1:thread:thread-1:participant:participant-2'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'act.thread.updated',
            properties: {
                thread: {
                    id: 'thread-1',
                    actId: 'act-1',
                    status: 'idle',
                    participantSessions: {
                        'participant-2': 'session-2',
                    },
                    participantStatuses: {
                        'participant-2': { type: 'idle', updatedAt: 1000 },
                    },
                    createdAt: 1,
                },
            },
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().actThreads['act-1']?.[0]?.participantSessions?.['participant-2']).toBe('session-2')
        expect(chatMessagesMock).toHaveBeenCalledWith('session-2')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('binds unknown act participant sessions from live message events without re-marking them as loading', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'act:act-1:thread:thread-1:participant:participant-2'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'message.updated',
            properties: {
                ownerId: chatKey,
                ownerKind: 'act',
                info: {
                    sessionID: 'session-2',
                    id: 'msg-1',
                    role: 'assistant',
                    time: { created: 1000 },
                },
            },
        })

        flushRAF()
        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seMessages['session-2']?.[0]?.id).toBe('msg-1')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('binds and streams camelCase act participant events without waiting for abort-time sync', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'act:act-1:thread:thread-1:participant:participant-2'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'message.updated',
            properties: {
                ownerId: chatKey,
                ownerKind: 'act',
                info: {
                    sessionId: 'session-2',
                    id: 'msg-1',
                    role: 'assistant',
                    time: { created: 1000 },
                },
            },
        })
        emitEvent(currentSources.chat, {
            type: 'message.part.delta',
            properties: {
                sessionId: 'session-2',
                messageId: 'msg-1',
                partId: 'part-1',
                field: 'text',
                delta: 'live output',
            },
        })

        flushRAF()
        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().seMessages['session-2']?.[0]?.content).toBe('live output')
        expect(chatMessagesMock).not.toHaveBeenCalledWith('session-2')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('buffers unknown act participant events until session ownership is resolved', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'act:act-1:thread:thread-1:participant:participant-2'

        let resolveOwnership: (value: { found: boolean; ownerId?: string; ownerKind?: string }) => void = () => {}
        resolveSessionMock.mockReset().mockImplementation(() => new Promise((resolve) => {
            resolveOwnership = resolve as typeof resolveOwnership
        }))

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'session.status',
            properties: {
                sessionID: 'session-2',
                status: { type: 'busy' },
            },
        })
        emitEvent(currentSources.chat, {
            type: 'message.updated',
            properties: {
                info: {
                    sessionID: 'session-2',
                    id: 'msg-1',
                    role: 'assistant',
                    time: { created: 1000 },
                },
            },
        })

        flushRAF()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBeUndefined()
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seMessages['session-2']).toBeUndefined()

        resolveOwnership({
            found: true,
            ownerId: chatKey,
            ownerKind: 'act',
        })
        await Promise.resolve()
        await Promise.resolve()
        flushRAF()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().actThreads['act-1']?.[0]?.participantSessions?.['participant-2']).toBe('session-2')
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seStatuses['session-2']).toBeUndefined()
        expect(harness.get().seMessages['session-2']?.[0]?.id).toBe('msg-1')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('treats server act thread updates as authoritative for participant status and final snapshot sync', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'act:act-1:thread:thread-1:participant:participant-2'

        chatMessagesMock.mockResolvedValue({
            messages: [
                {
                    id: 'msg-1',
                    info: {
                        id: 'msg-1',
                        role: 'assistant',
                        time: { created: 1000 },
                    },
                    parts: [
                        { id: 'text-1', type: 'text', text: 'Recovered reply' },
                    ],
                },
            ],
            nextCursor: null,
        })

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'act.thread.updated',
            properties: {
                thread: {
                    id: 'thread-1',
                    actId: 'act-1',
                    status: 'idle',
                    participantSessions: {
                        'participant-2': 'session-2',
                    },
                    participantStatuses: {
                        'participant-2': { type: 'busy', updatedAt: 1000 },
                    },
                    createdAt: 1,
                },
            },
        })

        await Promise.resolve()

        emitEvent(currentSources.chat, {
            type: 'act.thread.updated',
            properties: {
                thread: {
                    id: 'thread-1',
                    actId: 'act-1',
                    status: 'idle',
                    participantSessions: {
                        'participant-2': 'session-2',
                    },
                    participantStatuses: {
                        'participant-2': { type: 'idle', updatedAt: 2000 },
                    },
                    createdAt: 1,
                },
            },
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seStatuses['session-2']).toEqual({ type: 'idle', updatedAt: 2000 })
        expect(harness.get().seMessages['session-2']?.[0]?.content).toBe('Recovered reply')

        harness.get().cleanupRealtimeEvents()
    })
})
