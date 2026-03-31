import { describe, expect, it, vi } from 'vitest'
import { buildDraftAssetCards } from '../components/panels/asset-library-authoring'
import { api } from '../api'
import type { DraftAsset } from '../types'
import type { StudioState } from './types'
import { createMarkdownEditorImpl, saveMarkdownDraftImpl, upsertDraftImpl } from './workspace-draft-actions'

function createDraftState(): StudioState {
    return {
        drafts: {},
        markdownEditors: [],
        performers: [],
        acts: [],
        workingDir: '',
        workspaceId: null,
        workspaceList: [],
        workspaceDirty: false,
        runtimeReloadPending: false,
        theme: 'light',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isAssetLibraryOpen: false,
        canvasTerminals: [],
        trackingWindow: null,
        canvasCenter: null,
        layoutActId: null,
        editingTarget: null,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        focusedPerformerId: null,
        focusedNodeType: null,
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        chats: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        sessionMap: {},
        loadingPerformerId: null,
        sessions: [],
        pendingPermissions: {},
        pendingQuestions: {},
        todos: {},
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
        lspServers: [],
        lspDiagnostics: {},
        adapterViewsByPerformer: {},
        selectedActId: null,
        actEditorState: null,
        actThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
        isAssistantOpen: false,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
    } as unknown as StudioState
}

function createHarness(initialState = createDraftState()) {
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

describe('tal draft lifecycle', () => {
    it('creates new tal editor drafts as local-only until first save', () => {
        const harness = createHarness()
        const counter = { value: 0 }

        createMarkdownEditorImpl(
            harness.get,
            harness.set,
            counter,
            (prefix) => `${prefix}-1`,
            'tal',
        )

        const draft = harness.read().drafts['tal-draft-1'] as DraftAsset
        expect(draft).toBeTruthy()
        expect(draft.saveState).toBe('unsaved')
    })

    it('does not auto-persist unsaved tal drafts', () => {
        const harness = createHarness()
        const scheduleDraftPersist = vi.fn()

        upsertDraftImpl(harness.get, harness.set, scheduleDraftPersist, {
            id: 'tal-draft-1',
            kind: 'tal',
            name: 'Unsaved Tal',
            content: '# Tal',
            updatedAt: Date.now(),
            saveState: 'unsaved',
        })

        expect(scheduleDraftPersist).not.toHaveBeenCalled()
    })

    it('auto-persists tal drafts after the first explicit save', () => {
        const harness = createHarness()
        const scheduleDraftPersist = vi.fn()

        upsertDraftImpl(harness.get, harness.set, scheduleDraftPersist, {
            id: 'tal-draft-1',
            kind: 'tal',
            name: 'Saved Tal',
            content: '# Tal',
            updatedAt: Date.now(),
            saveState: 'saved',
        })

        expect(scheduleDraftPersist).toHaveBeenCalledTimes(1)
    })

    it('promotes markdown drafts to saved state on first explicit save', async () => {
        const harness = createHarness()
        const counter = { value: 0 }

        createMarkdownEditorImpl(
            harness.get,
            harness.set,
            counter,
            (prefix) => `${prefix}-1`,
            'dance',
        )

        const createSpy = vi.spyOn(api.drafts, 'create').mockResolvedValue({
            id: 'dance-draft-1',
            kind: 'dance',
            name: 'New Dance',
            content: 'dance body',
            slug: 'new-dance',
            description: 'New Dance',
            tags: [],
            derivedFrom: null,
            updatedAt: 123,
            saveState: 'saved',
        })

        const editorId = harness.read().markdownEditors[0]?.id
        expect(editorId).toBeTruthy()

        const saved = await saveMarkdownDraftImpl(harness.get, harness.set, editorId!)
        expect(saved.saveState).toBe('saved')
        expect(harness.read().drafts['dance-draft-1']?.saveState).toBe('saved')

        createSpy.mockRestore()
    })

    it('keeps unsaved tal drafts out of the asset library', () => {
        const cards = buildDraftAssetCards({
            hidden: {
                id: 'hidden',
                kind: 'tal',
                name: 'Unsaved Tal',
                content: '# Tal',
                updatedAt: 1,
                saveState: 'unsaved',
            },
            visible: {
                id: 'visible',
                kind: 'tal',
                name: 'Saved Tal',
                content: '# Tal',
                updatedAt: 2,
                saveState: 'saved',
            },
        }, 'tal')

        expect(cards).toHaveLength(1)
        expect(cards[0]?.draftId).toBe('visible')
    })
})
