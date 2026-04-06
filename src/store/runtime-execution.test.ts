import { describe, expect, it, vi } from 'vitest'
import type { StudioState } from './types'
import { preparePendingRuntimeExecution } from './runtime-execution'
import { createEmptyProjectionDirtyState } from './runtime-change-policy'

function createState(overrides: Partial<StudioState> = {}) {
    return {
        runtimeReloadPending: false,
        projectionDirty: createEmptyProjectionDirtyState(),
        workspaceDirty: false,
        workingDir: '/tmp/workspace',
        sessionLoading: {},
        seStatuses: {},
        seMessages: {},
        sePermissions: {},
        seQuestions: {},
        saveWorkspace: vi.fn(async () => {}),
        applyPendingRuntimeReload: vi.fn(async () => true),
        ...overrides,
    } as unknown as StudioState
}

describe('preparePendingRuntimeExecution', () => {
    it('blocks when runtime reload is still pending', async () => {
        const state = createState({
            runtimeReloadPending: true,
            applyPendingRuntimeReload: vi.fn(async () => false),
        })

        const result = await preparePendingRuntimeExecution(() => state, {
            performerId: 'performer-1',
            runtimeConfig: { talRef: null, danceRefs: [] },
        })

        expect(result.blocked).toBe(true)
        expect(result.reason).toBe('runtime_reload')
    })

    it('blocks projection changes while a session is running', async () => {
        const saveWorkspace = vi.fn(async () => {})
        const state = createState({
            workspaceDirty: true,
            projectionDirty: {
                performerIds: ['performer-1'],
                actIds: [],
                draftIds: [],
                workspaceWide: false,
            },
            sessionLoading: { 'session-1': true },
            sessionToChatKey: { 'session-1': 'performer-1' },
            performers: [
                {
                    id: 'performer-1',
                    name: 'Performer 1',
                    talRef: null,
                    danceRefs: [],
                    model: null,
                    mcpServerNames: [],
                    scope: 'shared',
                    position: { x: 0, y: 0 },
                },
            ],
            acts: [],
            saveWorkspace,
        })

        const result = await preparePendingRuntimeExecution(() => state, {
            performerId: 'performer-1',
            runtimeConfig: { talRef: null, danceRefs: [] },
        })

        expect(saveWorkspace).toHaveBeenCalledTimes(1)
        expect(result.blocked).toBe(true)
        expect(result.requiresDispose).toBe(true)
        expect(result.reason).toBe('projection_update_pending')
    })

    it('blocks projection changes when any session is running because dispose is workspace-scoped', async () => {
        const state = createState({
            projectionDirty: {
                performerIds: ['performer-2'],
                actIds: [],
                draftIds: [],
                workspaceWide: false,
            },
            sessionLoading: { 'session-1': true },
            sessionToChatKey: { 'session-1': 'performer-1' },
            performers: [
                {
                    id: 'performer-1',
                    name: 'Performer 1',
                    talRef: null,
                    danceRefs: [],
                    model: null,
                    mcpServerNames: [],
                    scope: 'shared',
                    position: { x: 0, y: 0 },
                },
            ],
            acts: [],
        })

        const result = await preparePendingRuntimeExecution(() => state, {
            performerId: 'performer-2',
            runtimeConfig: { talRef: null, danceRefs: [] },
        })

        expect(result.blocked).toBe(true)
        expect(result.requiresDispose).toBe(true)
        expect(result.reason).toBe('projection_update_pending')
    })

    it('ignores stale loading once the session status is idle', async () => {
        const state = createState({
            projectionDirty: {
                performerIds: ['performer-2'],
                actIds: [],
                draftIds: [],
                workspaceWide: false,
            },
            sessionLoading: { 'session-1': true },
            seStatuses: { 'session-1': { type: 'idle' } },
            sessionToChatKey: { 'session-1': 'performer-2' },
            performers: [
                {
                    id: 'performer-2',
                    name: 'Performer 2',
                    talRef: null,
                    danceRefs: [],
                    model: null,
                    mcpServerNames: [],
                    scope: 'shared',
                    position: { x: 0, y: 0 },
                },
            ],
            acts: [],
        })

        const result = await preparePendingRuntimeExecution(() => state, {
            performerId: 'performer-2',
            runtimeConfig: { talRef: null, danceRefs: [] },
        })

        expect(result.blocked).toBe(false)
        expect(result.requiresDispose).toBe(true)
    })

    it('blocks when a running session shares the same runtime draft', async () => {
        const state = createState({
            projectionDirty: {
                performerIds: [],
                actIds: [],
                draftIds: ['draft-shared'],
                workspaceWide: false,
            },
            sessionLoading: { 'session-1': true },
            seStatuses: { 'session-1': { type: 'busy' } },
            sessionToChatKey: { 'session-1': 'performer-1' },
            performers: [
                {
                    id: 'performer-1',
                    name: 'Performer 1',
                    talRef: { kind: 'draft', draftId: 'draft-shared' },
                    danceRefs: [],
                    model: null,
                    mcpServerNames: [],
                    scope: 'shared',
                    position: { x: 0, y: 0 },
                },
            ],
            acts: [],
        })

        const result = await preparePendingRuntimeExecution(() => state, {
            performerId: 'performer-2',
            runtimeConfig: { talRef: { kind: 'draft', draftId: 'draft-shared' }, danceRefs: [] },
        })

        expect(result.blocked).toBe(true)
        expect(result.reason).toBe('projection_update_pending')
    })

    it('ignores wait_until parked sessions even when stale loading remains', async () => {
        const state = createState({
            projectionDirty: {
                performerIds: ['performer-2'],
                actIds: [],
                draftIds: [],
                workspaceWide: false,
            },
            sessionLoading: { 'session-1': true },
            seStatuses: { 'session-1': { type: 'busy' } },
            seMessages: {
                'session-1': [{
                    id: 'msg-1',
                    role: 'assistant',
                    content: '',
                    timestamp: 1,
                    parts: [{
                        id: 'tool-1',
                        type: 'tool',
                        tool: {
                            name: 'wait_until',
                            callId: 'call-1',
                            status: 'completed',
                        },
                    }],
                }],
            },
            performers: [
                {
                    id: 'performer-2',
                    name: 'Performer 2',
                    talRef: null,
                    danceRefs: [],
                    model: null,
                    mcpServerNames: [],
                    scope: 'shared',
                    position: { x: 0, y: 0 },
                },
            ],
            acts: [],
        })

        const result = await preparePendingRuntimeExecution(() => state, {
            performerId: 'performer-2',
            runtimeConfig: { talRef: null, danceRefs: [] },
        })

        expect(result.blocked).toBe(false)
        expect(result.requiresDispose).toBe(true)
    })
})
