// DOT Studio — Act Slice (Choreography Model)
// Act entity: participant ref binding + communication contract relations + canvas position

import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { StudioState, ActSlice } from './types'
import type { StageAct, StageActParticipantBinding } from '../types'
import {
    autoLayoutBindings,
    createActThreadImpl,
    importActFromAssetImpl,
    loadActThreadsImpl,
} from './act-slice-helpers'
import {
    addActRelationImpl,
    createActFromPerformersImpl,
} from './act-slice-actions'

const ACT_DEFAULT_WIDTH = 340
const ACT_DEFAULT_HEIGHT = 80

export const createActSlice: StateCreator<StudioState, [], [], ActSlice> = (set, get) => ({
    acts: [],
    selectedActId: null,
    selectedActParticipantKey: null,
    selectedRelationId: null,

    // ── Thread state ────────────────────────────────────
    actThreads: {},
    activeThreadId: null,
    activeThreadParticipantKey: null,

    // ── Act Definition CRUD ─────────────────────────────

    addAct: (name) => {
        const id = nanoid(12)
        const center = get().canvasCenter
        const act: StageAct = {
            id,
            name,
            position: center ? { x: center.x, y: center.y + 200 } : { x: 200, y: 200 },
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_HEIGHT,
            participants: {},
            relations: [],
            createdAt: Date.now(),
        }
        set((s) => ({
            acts: [...s.acts, act],
            selectedActId: id,
            selectedPerformerId: null,
            selectedActParticipantKey: null,
            selectedRelationId: null,
            activeThreadId: null,
            activeThreadParticipantKey: null,
            stageDirty: true,
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
            selectedActParticipantKey: s.selectedActId === id ? null : s.selectedActParticipantKey,
            selectedRelationId: s.selectedActId === id ? null : s.selectedRelationId,
            activeThreadId: s.selectedActId === id ? null : s.activeThreadId,
            activeThreadParticipantKey: s.selectedActId === id ? null : s.activeThreadParticipantKey,
            stageDirty: true,
        }))
    },

    renameAct: (id, name) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, name } : a)),
            stageDirty: true,
        }))
    },

    updateActDescription: (id, description) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, description } : a)),
            stageDirty: true,
        }))
    },

    updateActRules: (id, rules) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, actRules: rules } : a)),
            stageDirty: true,
        }))
    },

    selectAct: (id) => {
        const state = get()
        const nextThreads = id ? (state.actThreads[id] || []) : []
        const nextActiveThreadId = nextThreads.some((thread) => thread.id === state.activeThreadId)
            ? state.activeThreadId
            : (nextThreads[0]?.id || null)
        set({
            selectedActId: id,
            selectedPerformerId: null,
            selectedActParticipantKey: null,
            selectedRelationId: null,
            activeThreadId: nextActiveThreadId,
            activeThreadParticipantKey: null,
        })
        if (id) {
            void get().loadThreads(id)
        }
    },

    toggleActVisibility: (id) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, hidden: !a.hidden } : a)),
            stageDirty: true,
        }))
    },

    // ── Participant Binding (ref-based) ─────────────────

    bindPerformerToAct: (actId, performerRef) => {
        const newKey = nanoid(12)
        set((s) => {
            const act = s.acts.find((a) => a.id === actId)
            const existingKeys = act ? Object.keys(act.participants) : []
            const newPos = { x: existingKeys.length * 300, y: 100 }
            const binding: StageActParticipantBinding = {
                performerRef,
                position: newPos,
            }
            return {
                acts: s.acts.map((a) => {
                    if (a.id !== actId) return a
                    return {
                        ...a,
                        participants: { ...a.participants, [newKey]: binding },
                    }
                }),
                stageDirty: true,
            }
        })
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
                selectedActParticipantKey: existing[0],
                selectedRelationId: null,
            })
            return existing[0]
        }

        const existingParticipantKeys = Object.keys(act.participants)
        const newKey = get().bindPerformerToAct(actId, performerRef)
        let relationId: string | null = null
        if (existingParticipantKeys.length === 1) {
            relationId = get().addRelation(actId, [existingParticipantKeys[0], newKey], 'both')
        }
        get().autoLayoutActParticipants(actId)
        set({
            selectedActId: actId,
            selectedPerformerId: null,
            selectedActParticipantKey: relationId ? null : newKey,
            selectedRelationId: relationId,
        })
        return newKey
    },

    createActFromPerformers: (performerIds, options) => createActFromPerformersImpl(
        get,
        set,
        performerIds,
        options,
        { width: ACT_DEFAULT_WIDTH, height: 320 },
    ),

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
            stageDirty: true,
        }))
    },

    unbindPerformerFromAct: (actId, participantKey) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                const { [participantKey]: _removed, ...rest } = a.participants
                // Remove relations involving this participant
                const relations = a.relations.filter(
                    (r) => !r.between.includes(participantKey),
                )
                return { ...a, participants: rest, relations }
            }),
            stageDirty: true,
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
            stageDirty: true,
        }))
    },

    selectActParticipant: (key) => {
        set({
            selectedActParticipantKey: key,
            selectedRelationId: null,
            activeThreadParticipantKey: key,
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
            stageDirty: true,
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
            stageDirty: true,
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
            stageDirty: true,
        }))
    },

    selectRelation: (id) => {
        set({
            selectedRelationId: id,
            selectedActParticipantKey: null,
            activeThreadParticipantKey: null,
        })
    },

    // ── Canvas ──────────────────────────────────────────

    updateActPosition: (id, x, y) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, position: { x, y } } : a)),
            stageDirty: true,
        }))
    },

    updateActSize: (id, width, height) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, width, height } : a)),
            stageDirty: true,
        }))
    },



    // ── Authoring / import ──────────────────────────────

    updateActAuthoringMeta: (id, meta) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, meta: { ...a.meta, ...meta } } : a)),
            stageDirty: true,
        }))
    },

    importActFromAsset: (asset) => {
        importActFromAssetImpl(get, set, asset, {
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_HEIGHT,
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
