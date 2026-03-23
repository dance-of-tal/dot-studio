// DOT Studio — Act Slice (Choreography Model)
// Act entity: participant ref binding + communication contract relations + canvas position

import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { StudioState, ActEditorState, ActSlice } from './types'
import type { WorkspaceAct, WorkspaceActParticipantBinding } from '../types'
import {
    ACT_DEFAULT_EXPANDED_HEIGHT,
    ACT_DEFAULT_WIDTH,
} from '../lib/act-layout'
import { assetUrnDisplayName } from '../lib/asset-urn'
import {
    autoLayoutBindings,
    createActThreadImpl,
    importActFromAssetImpl,
    loadActThreadsImpl,
} from './act-slice-helpers'
import {
    addActRelationImpl,
} from './act-slice-actions'

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
        return id
    },

    removeAct: (id) => {
        set((s) => ({
            acts: s.acts.filter((a) => a.id !== id),
            actThreads: Object.fromEntries(
                Object.entries(s.actThreads).filter(([actId]) => actId !== id),
            ),
            selectedActId: s.selectedActId === id ? null : s.selectedActId,
            actEditorState: s.actEditorState?.actId === id ? null : s.actEditorState,
            activeThreadId: s.selectedActId === id ? null : s.activeThreadId,
            activeThreadParticipantKey: s.selectedActId === id ? null : s.activeThreadParticipantKey,
            workspaceDirty: true,
        }))
    },

    renameAct: (id, name) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, name } : a)),
            workspaceDirty: true,
        }))
    },

    updateActDescription: (id, description) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, description } : a)),
            workspaceDirty: true,
        }))
    },

    updateActRules: (id, rules) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, actRules: rules } : a)),
            workspaceDirty: true,
        }))
    },

    selectAct: (id) => {
        const state = get()
        const nextThreads = id ? (state.actThreads[id] || []) : []
        const nextActiveThreadId = nextThreads.some((thread) => thread.id === state.activeThreadId)
            ? state.activeThreadId
            : null
        set({
            selectedActId: id,
            selectedPerformerId: null,
            actEditorState: state.actEditorState?.actId === id ? state.actEditorState : null,
            activeThreadId: nextActiveThreadId,
            activeThreadParticipantKey: state.selectedActId === id ? state.activeThreadParticipantKey : null,
        })
        if (id) {
            void get().loadThreads(id)
        }
    },

    toggleActVisibility: (id) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, hidden: !a.hidden } : a)),
            workspaceDirty: true,
        }))
    },

    // ── Participant Binding (ref-based) ─────────────────

    bindPerformerToAct: (actId, performerRef) => {
        const state = get()
        // Resolve performer name from ref
        let baseName: string | null = null
        if (performerRef.kind === 'draft') {
            baseName = state.performers.find(p => p.id === performerRef.draftId)?.name ?? null
        } else if (performerRef.kind === 'registry') {
            // Try matching canvas performer, else extract from URN
            baseName = state.performers.find(p => p.meta?.derivedFrom === performerRef.urn)?.name
                ?? assetUrnDisplayName(performerRef.urn) ?? null
        }
        if (!baseName) baseName = nanoid(8)

        // Ensure unique within this Act's participants
        const act = state.acts.find((a) => a.id === actId)
        const existingKeys = act ? Object.keys(act.participants) : []
        let newKey = baseName
        if (existingKeys.includes(newKey)) {
            let i = 2
            while (existingKeys.includes(`${baseName} (${i})`)) i++
            newKey = `${baseName} (${i})`
        }

        const newPos = { x: existingKeys.length * 300, y: 100 }
        const binding: WorkspaceActParticipantBinding = {
            performerRef,
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

        const existingParticipantKeys = Object.keys(act.participants)
        const newKey = get().bindPerformerToAct(actId, performerRef)
        if (existingParticipantKeys.length === 1) {
            get().addRelation(actId, [existingParticipantKeys[0], newKey], 'both')
        }
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
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                return { ...a, relations: a.relations.filter((r) => r.id !== relationId) }
            }),
            workspaceDirty: true,
        }))
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
    },

    importActFromAsset: (asset) => {
        importActFromAssetImpl(get, set, asset, {
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_EXPANDED_HEIGHT,
        })
    },

    // ── Thread management ────────────────────────────────

    createThread: async (actId) => createActThreadImpl(get, set, actId),

    selectThread: (threadId) => {
        set({ activeThreadId: threadId, activeThreadParticipantKey: null })
    },

    selectThreadParticipant: (participantKey) => {
        set({ activeThreadParticipantKey: participantKey })
    },

    loadThreads: async (actId) => loadActThreadsImpl(get, set, actId),
})
