import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { StudioState, ActSlice } from './types'
import type { WorkspaceAct } from '../types'
import { api } from '../api'
import {
    ACT_DEFAULT_EXPANDED_HEIGHT,
    ACT_DEFAULT_WIDTH,
} from '../lib/act-layout'
import {
    autoLayoutBindings,
    buildActEditorSelectionState,
    buildActSelectionState,
    buildActThreadSelectionState,
    buildDeletedActThreadState,
    buildSelectActState,
    createActEditorState,
    createActParticipantBinding,
    createActThreadImpl,
    findExistingParticipantKey,
    importActFromAssetImpl,
    listActThreadChatKeys,
    loadActThreadsImpl,
    performerNodeToActRef,
    resolveActEditorStateAfterRelationRemoval,
    scheduleActRuntimeSync,
} from './act-slice-helpers'
import {
    addActRelationImpl,
} from './act-slice-actions'
import { buildExitFocusModeState } from './workspace-focus-actions'
import { resolveCanvasSpawnPosition } from './workspace-helpers'
import { clearChatSessionView } from './session'

export const createActSlice: StateCreator<StudioState, [], [], ActSlice> = (set, get) => ({
    acts: [],
    selectedActId: null,
    actEditorState: null,

    // ── Thread state ────────────────────────────────────
    actThreads: {},
    activeThreadId: null,
    activeThreadParticipantKey: null,

    // ── Act Definition CRUD ─────────────────────────────

    addAct: (name) => {
        const id = nanoid(12)
        const spawnPosition = resolveCanvasSpawnPosition({
            canvasCenter: get().canvasCenter,
            existingCount: get().acts.length,
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_EXPANDED_HEIGHT,
        })
        const act: WorkspaceAct = {
            id,
            name,
            position: spawnPosition,
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_EXPANDED_HEIGHT,
            participants: {},
            relations: [],
            createdAt: Date.now(),
        }
        set((s) => ({
            acts: [...s.acts, act],
            selectedActId: id,
            selectedPerformerId: null,
            actEditorState: null,
            activeThreadId: null,
            activeThreadParticipantKey: null,
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [id] })
        return id
    },

    removeAct: (id) => {
        set((s) => {
            const focusExit = buildExitFocusModeState(s)
            const acts = (focusExit?.acts as StudioState['acts'] | undefined) || s.acts

            return {
                ...focusExit,
                acts: acts.filter((act) => act.id !== id),
                actThreads: Object.fromEntries(
                    Object.entries(s.actThreads).filter(([actId]) => actId !== id),
                ),
                selectedActId: s.selectedActId === id ? null : s.selectedActId,
                actEditorState: s.actEditorState?.actId === id ? null : s.actEditorState,
                activeThreadId: s.selectedActId === id ? null : s.activeThreadId,
                activeThreadParticipantKey: s.selectedActId === id ? null : s.activeThreadParticipantKey,
                workspaceDirty: true,
            }
        })
        get().recordStudioChange({ kind: 'act', actIds: [id], workspaceWide: true })
    },

    renameAct: (id, name) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, name } : a)),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [id] })
        scheduleActRuntimeSync(get, set, id)
    },

    updateActDescription: (id, description) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, description } : a)),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [id] })
        scheduleActRuntimeSync(get, set, id)
    },

    updateActRules: (id, rules) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, actRules: rules } : a)),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [id] })
        scheduleActRuntimeSync(get, set, id)
    },

    updateActSafety: (id, safety) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, safety } : a)),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [id] })
        scheduleActRuntimeSync(get, set, id)
    },

    selectAct: (id) => {
        set((state) => buildSelectActState(state, id))
        if (id) {
            void get().loadThreads(id)
        }
    },

    toggleActVisibility: (id) => {
        set((s) => {
            const focusExit = buildExitFocusModeState(s)
            const acts = (focusExit?.acts as StudioState['acts'] | undefined) || s.acts

            return {
                ...focusExit,
                acts: acts.map((act) => (act.id === id ? { ...act, hidden: !act.hidden } : act)),
                workspaceDirty: true,
            }
        })
    },

    // ── Participant Binding (ref-based) ─────────────────

    bindPerformerToAct: (actId, performerRef) => {
        const state = get()
        const act = state.acts.find((entry) => entry.id === actId)
        if (!act) {
            return null
        }

        const { key: newKey, binding } = createActParticipantBinding({
            act,
            performers: state.performers,
            performerRef,
        })
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                return {
                    ...a,
                    participants: { ...a.participants, [newKey]: binding },
                }
            }),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [actId] })
        scheduleActRuntimeSync(get, set, actId)
        return newKey
    },

    attachPerformerRefToAct: (actId, performerRef) => {
        const state = get()
        const act = state.acts.find((a) => a.id === actId)
        if (!act) {
            return null
        }

        const existingParticipantKey = findExistingParticipantKey(act, performerRef)
        if (existingParticipantKey) {
            set(buildActSelectionState(state, actId))
            return existingParticipantKey
        }

        const newKey = get().bindPerformerToAct(actId, performerRef)
        get().autoLayoutActParticipants(actId)
        set(buildActSelectionState(state, actId))
        return newKey
    },

    attachPerformerToAct: (actId, performerId) => {
        const state = get()
        const act = state.acts.find((a) => a.id === actId)
        const performer = state.performers.find((p) => p.id === performerId)
        if (!act || !performer) {
            return null
        }

        return get().attachPerformerRefToAct(actId, performerNodeToActRef(performer))
    },

    autoLayoutActParticipants: (actId) => {
        set((s) => ({
            acts: s.acts.map((act) => {
                if (act.id !== actId) return act
                return {
                    ...act,
                    participants: autoLayoutBindings(act.participants),
                }
            }),
            workspaceDirty: true,
        }))
    },

    unbindPerformerFromAct: (actId, participantKey) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                const rest = { ...a.participants }
                delete rest[participantKey]
                // Remove relations involving this participant
                const relations = a.relations.filter(
                    (r) => !(r as unknown as { between: [string, string] }).between.includes(participantKey),
                )
                return { ...a, participants: rest, relations }
            }),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [actId] })
        scheduleActRuntimeSync(get, set, actId)
    },

    updatePerformerBinding: (actId, participantKey, update) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId || !a.participants[participantKey]) return a
                return {
                    ...a,
                    participants: {
                        ...a.participants,
                        [participantKey]: { ...a.participants[participantKey], ...update },
                    },
                }
            }),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [actId] })
        scheduleActRuntimeSync(get, set, actId)
    },

    openActEditor: (actId, mode = 'act', options = {}) => {
        set((state) => buildActEditorSelectionState(
            state,
            actId,
            createActEditorState(actId, mode, options),
        ))
    },

    closeActEditor: () => {
        set({ actEditorState: null })
    },

    openActParticipantEditor: (actId, participantKey) => {
        set((state) => buildActEditorSelectionState(
            state,
            actId,
            createActEditorState(actId, 'participant', { participantKey }),
        ))
    },

    openActRelationEditor: (actId, relationId) => {
        set((state) => buildActEditorSelectionState(
            state,
            actId,
            createActEditorState(actId, 'relation', { relationId }),
        ))
    },

    updateActParticipantPosition: (actId, participantKey, x, y) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId || !a.participants[participantKey]) return a
                return {
                    ...a,
                    participants: {
                        ...a.participants,
                        [participantKey]: { ...a.participants[participantKey], position: { x, y } },
                    },
                }
            }),
            workspaceDirty: true,
        }))
    },

    // ── Relation (communication contract) ───────────────

    addRelation: (actId, between, direction) => addActRelationImpl(get, set, actId, between, direction),

    removeRelation: (actId, relationId) => {
        set((s) => {
            const act = s.acts.find((a) => a.id === actId)
            if (!act) return {}

            const nextRelations = act.relations.filter((r) => r.id !== relationId)

            // Find orphan participants — those not referenced by any remaining relation
            const referencedKeys = new Set<string>()
            for (const rel of nextRelations) {
                for (const key of rel.between) {
                    referencedKeys.add(key)
                }
            }
            const nextParticipants = nextRelations.length === 0
                ? {} // No relations → no participants
                : Object.fromEntries(
                    Object.entries(act.participants).filter(([key]) => referencedKeys.has(key)),
                )

            const nextActEditorState = resolveActEditorStateAfterRelationRemoval(
                s.actEditorState,
                actId,
                relationId,
                nextParticipants,
            )

            return {
                acts: s.acts.map((a) => {
                    if (a.id !== actId) return a
                    return { ...a, participants: nextParticipants, relations: nextRelations }
                }),
                actEditorState: nextActEditorState,
                workspaceDirty: true,
            }
        })
        get().recordStudioChange({ kind: 'act', actIds: [actId] })
        scheduleActRuntimeSync(get, set, actId)
    },

    updateRelation: (actId, relationId, update) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                return {
                    ...a,
                    relations: a.relations.map((r) =>
                        r.id === relationId ? { ...r, ...update } : r,
                    ),
                }
            }),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [actId] })
        scheduleActRuntimeSync(get, set, actId)
    },

    // ── Canvas ──────────────────────────────────────────

    updateActPosition: (id, x, y) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, position: { x, y } } : a)),
            workspaceDirty: true,
        }))
    },

    updateActSize: (id, width, height) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, width, height } : a)),
            workspaceDirty: true,
        }))
    },



    // ── Authoring / import ──────────────────────────────

    updateActAuthoringMeta: (id, meta) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, meta: { ...a.meta, ...meta } } : a)),
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'act', actIds: [id] })
    },

    importActFromAsset: (asset) => {
        importActFromAssetImpl(get, set, asset, {
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_EXPANDED_HEIGHT,
        })
    },

    // ── Thread management ────────────────────────────────

    createThread: async (actId) => createActThreadImpl(get, set, actId),

    selectThread: (actId, threadId) => {
        set((state) => buildActThreadSelectionState(state, actId, threadId))
    },

    selectThreadParticipant: (participantKey) => {
        set((state) => {
            if (!state.selectedActId || !state.activeThreadId) {
                return {}
            }

            return buildActThreadSelectionState(
                state,
                state.selectedActId,
                state.activeThreadId,
                participantKey,
            )
        })
    },

    loadThreads: async (actId) => loadActThreadsImpl(get, set, actId),

    deleteThread: async (actId, threadId) => {
        await api.actRuntime.deleteThread(actId, threadId)
        const threadChatKeys = listActThreadChatKeys(get(), actId, threadId)
        set((state: StudioState) => buildDeletedActThreadState(state, actId, threadId))
        for (const chatKey of threadChatKeys) {
            clearChatSessionView(get, chatKey)
        }
    },

    renameThread: (actId, threadId, name) => {
        set((state: StudioState) => ({
            actThreads: {
                ...state.actThreads,
                [actId]: (state.actThreads[actId] || []).map((t) =>
                    t.id === threadId ? { ...t, name } : t,
                ),
            },
        }))
    },
})
