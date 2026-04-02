import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { StudioState, ActEditorState, ActSlice } from './types'
import type { WorkspaceAct, WorkspaceActParticipantBinding } from '../types'
import { api } from '../api'
import {
    ACT_DEFAULT_EXPANDED_HEIGHT,
    ACT_DEFAULT_WIDTH,
} from '../lib/act-layout'
import { assetUrnDisplayName } from '../lib/asset-urn'
import {
    autoLayoutBindings,
    createActParticipantKey,
    createActThreadImpl,
    importActFromAssetImpl,
    loadActThreadsImpl,
    scheduleActRuntimeSync,
} from './act-slice-helpers'
import {
    addActRelationImpl,
} from './act-slice-actions'
import { buildExitFocusModeState } from './workspace-focus-actions'
import { resolvePreferredActThreadId } from '../lib/act-threads'
import { clearChatSessionView } from './session'

function createActEditorState(
    actId: string,
    mode: ActEditorState['mode'],
    options: { participantKey?: string | null; relationId?: string | null } = {},
): ActEditorState {
    return {
        actId,
        mode,
        participantKey: options.participantKey ?? null,
        relationId: options.relationId ?? null,
    }
}

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
        const center = get().canvasCenter
        const existingCount = get().acts.length
        const offset = existingCount * 40
        const act: WorkspaceAct = {
            id,
            name,
            position: center
                ? { x: center.x + offset, y: center.y + 200 + offset }
                : { x: 200 + offset, y: 200 + offset },
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
        const state = get()
        const nextThreads = id ? (state.actThreads[id] || []) : []
        const nextActiveThreadId = id
            ? resolvePreferredActThreadId(nextThreads, state.activeThreadId)
            : state.activeThreadId
        set((s) => ({
            selectedActId: id,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
            actEditorState: state.actEditorState?.actId === id ? state.actEditorState : null,
            activeThreadId: nextActiveThreadId,
            activeThreadParticipantKey: id === null
                ? state.activeThreadParticipantKey
                : (state.selectedActId === id && nextActiveThreadId === state.activeThreadId
                    ? state.activeThreadParticipantKey
                    : null),
            // Clear stale focus when not in focus mode; preserve when in focus
            focusedPerformerId: s.focusSnapshot ? s.focusedPerformerId : null,
            focusedNodeType: s.focusSnapshot ? s.focusedNodeType : null,
        }))
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
        let displayName: string | null = null
        if (performerRef.kind === 'draft') {
            displayName = state.performers.find(p => p.id === performerRef.draftId)?.name ?? null
        } else if (performerRef.kind === 'registry') {
            displayName = state.performers.find(p => p.meta?.derivedFrom === performerRef.urn)?.name
                ?? assetUrnDisplayName(performerRef.urn) ?? null
        }
        if (!displayName) displayName = `Participant ${Object.keys(state.acts.find((a) => a.id === actId)?.participants || {}).length + 1}`
        const newKey = createActParticipantKey()
        const existingKeys = Object.keys(state.acts.find((a) => a.id === actId)?.participants || {})

        const newPos = { x: existingKeys.length * 300, y: 100 }
        const binding: WorkspaceActParticipantBinding = {
            performerRef,
            displayName,
            position: newPos,
        }
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

        const existing = Object.entries(act.participants).find(([, binding]) => (
            (binding.performerRef.kind === 'draft' && performerRef.kind === 'draft' && binding.performerRef.draftId === performerRef.draftId)
            || (binding.performerRef.kind === 'registry' && performerRef.kind === 'registry' && binding.performerRef.urn === performerRef.urn)
        ))

        if (existing) {
            set({
                selectedActId: actId,
                selectedPerformerId: null,
                actEditorState: state.actEditorState?.actId === actId ? state.actEditorState : null,
            })
            return existing[0]
        }

        const newKey = get().bindPerformerToAct(actId, performerRef)
        get().autoLayoutActParticipants(actId)
        set({
            selectedActId: actId,
            selectedPerformerId: null,
            actEditorState: state.actEditorState?.actId === actId ? state.actEditorState : null,
        })
        return newKey
    },

    attachPerformerToAct: (actId, performerId) => {
        const state = get()
        const act = state.acts.find((a) => a.id === actId)
        const performer = state.performers.find((p) => p.id === performerId)
        if (!act || !performer) {
            return null
        }

        const derivedFrom = performer.meta?.derivedFrom?.trim()
        const performerRef = derivedFrom
            ? { kind: 'registry' as const, urn: derivedFrom }
            : { kind: 'draft' as const, draftId: performer.id }

        return get().attachPerformerRefToAct(actId, performerRef)
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
        set({
            selectedActId: actId,
            selectedPerformerId: null,
            actEditorState: createActEditorState(actId, mode, options),
        })
    },

    closeActEditor: () => {
        set({ actEditorState: null })
    },

    openActParticipantEditor: (actId, participantKey) => {
        set({
            selectedActId: actId,
            selectedPerformerId: null,
            actEditorState: createActEditorState(actId, 'participant', { participantKey }),
        })
    },

    openActRelationEditor: (actId, relationId) => {
        set({
            selectedActId: actId,
            selectedPerformerId: null,
            actEditorState: createActEditorState(actId, 'relation', { relationId }),
        })
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

            // Reset actEditorState if it points to a removed participant
            let nextActEditorState = s.actEditorState
            if (
                nextActEditorState?.actId === actId
                && nextActEditorState.mode === 'participant'
                && nextActEditorState.participantKey
                && !nextParticipants[nextActEditorState.participantKey]
            ) {
                nextActEditorState = createActEditorState(actId, 'act')
            }
            // Reset if it points to the removed relation
            if (
                nextActEditorState?.actId === actId
                && nextActEditorState.mode === 'relation'
                && nextActEditorState.relationId === relationId
            ) {
                nextActEditorState = createActEditorState(actId, 'act')
            }

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
        set({
            activeThreadId: threadId,
            activeThreadParticipantKey: null,
            selectedActId: actId,
            selectedPerformerId: null,
            selectedPerformerSessionId: null,
        })
    },

    selectThreadParticipant: (participantKey) => {
        set({ activeThreadParticipantKey: participantKey })
    },

    loadThreads: async (actId) => loadActThreadsImpl(get, set, actId),

    deleteThread: async (actId, threadId) => {
        await api.actRuntime.deleteThread(actId, threadId)
        const threadKeyPrefix = `act:${actId}:thread:${threadId}:participant:`
        const threadChatKeys = Object.keys(get().chatKeyToSession).filter((key) => key.startsWith(threadKeyPrefix))
        set((state: StudioState) => {
            const threads = (state.actThreads[actId] || []).filter((t) => t.id !== threadId)
            const nextActiveThread = state.activeThreadId === threadId
                ? resolvePreferredActThreadId(threads, null)
                : state.activeThreadId

            return {
                actThreads: { ...state.actThreads, [actId]: threads },
                activeThreadId: nextActiveThread,
                activeThreadParticipantKey: nextActiveThread ? state.activeThreadParticipantKey : null,
            }
        })
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
