// DOT Studio — Act Slice (Choreography Model)
// Act entity: performer ref binding + communication contract relations + canvas position

import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { StudioState, ActSlice } from './types'
import type { StageAct, StageActPerformerBinding, ActRelation } from '../types'
import { api } from '../api'

const ACT_DEFAULT_WIDTH = 340
const ACT_DEFAULT_HEIGHT = 80

export const createActSlice: StateCreator<StudioState, [], [], ActSlice> = (set, get) => ({
    acts: [],
    selectedActId: null,
    editingActId: null,
    selectedActPerformerKey: null,
    selectedRelationId: null,

    // ── Thread state ────────────────────────────────────
    actThreads: {},
    activeThreadId: null,
    activeThreadPerformerKey: null,

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
            performers: {},
            relations: [],
            createdAt: Date.now(),
        }
        set((s) => ({ acts: [...s.acts, act], stageDirty: true }))
        return id
    },

    removeAct: (id) => {
        set((s) => ({
            acts: s.acts.filter((a) => a.id !== id),
            selectedActId: s.selectedActId === id ? null : s.selectedActId,
            editingActId: s.editingActId === id ? null : s.editingActId,
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
        set({ selectedActId: id, selectedPerformerId: null })
    },

    toggleActVisibility: (id) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, hidden: !a.hidden } : a)),
            stageDirty: true,
        }))
    },

    toggleActEdit: (id) => {
        set((s) => ({
            editingActId: s.editingActId === id ? null : id,
        }))
    },

    // ── Performer Binding (ref-based) ───────────────────

    bindPerformerToAct: (actId, performerRef) => {
        const newKey = nanoid(12)
        set((s) => {
            const act = s.acts.find((a) => a.id === actId)
            const existingKeys = act ? Object.keys(act.performers) : []
            const newPos = { x: existingKeys.length * 300, y: 100 }
            const binding: StageActPerformerBinding = {
                performerRef,
                position: newPos,
            }
            return {
                acts: s.acts.map((a) => {
                    if (a.id !== actId) return a
                    return {
                        ...a,
                        performers: { ...a.performers, [newKey]: binding },
                    }
                }),
                stageDirty: true,
            }
        })
        return newKey
    },

    unbindPerformerFromAct: (actId, performerKey) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                const { [performerKey]: _removed, ...rest } = a.performers
                // Remove relations involving this performer
                const relations = a.relations.filter(
                    (r) => !r.between.includes(performerKey),
                )
                return { ...a, performers: rest, relations }
            }),
            stageDirty: true,
        }))
    },

    updatePerformerBinding: (actId, performerKey, update) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId || !a.performers[performerKey]) return a
                return {
                    ...a,
                    performers: {
                        ...a.performers,
                        [performerKey]: { ...a.performers[performerKey], ...update },
                    },
                }
            }),
            stageDirty: true,
        }))
    },

    selectActPerformer: (key) => {
        set({ selectedActPerformerKey: key, selectedRelationId: null })
    },

    updateActPerformerPosition: (actId, performerKey, x, y) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId || !a.performers[performerKey]) return a
                return {
                    ...a,
                    performers: {
                        ...a.performers,
                        [performerKey]: { ...a.performers[performerKey], position: { x, y } },
                    },
                }
            }),
            stageDirty: true,
        }))
    },

    // ── Relation (communication contract) ───────────────

    addRelation: (actId, between, direction) => {
        const relation: ActRelation = {
            id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            between,
            direction,
            name: `${between[0]}_to_${between[1]}`,
            maxCalls: 10,
            timeout: 300,
        }
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                // Prevent duplicates (same pair)
                const exists = a.relations.some(
                    (r) =>
                        (r.between[0] === between[0] && r.between[1] === between[1]) ||
                        (r.between[0] === between[1] && r.between[1] === between[0]),
                )
                if (exists) return a
                return { ...a, relations: [...a.relations, relation] }
            }),
            stageDirty: true,
        }))
    },

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
        set({ selectedRelationId: id, selectedActPerformerKey: null })
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

    // ── Focus mode for Act editing ──────────────────────

    enterActEditFocus: (actId) => {
        const state = get()
        const act = state.acts.find((a) => a.id === actId)
        if (!act) return

        const focusSnapshot = {
            type: 'act' as const,
            actId,
            hiddenPerformerIds: state.performers.filter((p) => p.hidden).map((p) => p.id),
            hiddenActIds: state.acts.filter((a) => (a as any).hidden).map((a) => a.id),
            hiddenEditorIds: state.markdownEditors.filter((e) => e.hidden).map((e) => e.id),
            hiddenTerminalIds: [] as string[],
            nodeSize: { width: 0, height: 0 },
            assetLibraryOpen: state.isAssetLibraryOpen,
            assistantOpen: state.isAssistantOpen,
            terminalOpen: state.isTerminalOpen,
        }

        set({
            editingActId: actId,
            selectedActId: actId,
            selectedActPerformerKey: null,
            focusSnapshot,
            performers: state.performers.map((p) => ({ ...p, hidden: true })),
            markdownEditors: state.markdownEditors.map((e) => ({ ...e, hidden: true })),
            isAssistantOpen: false,
            isTerminalOpen: false,
            editingTarget: null,
            inspectorFocus: null,
            focusedPerformerId: null,
            focusedNodeType: null,
        })
    },

    exitActEditFocus: () => {
        const state = get()
        const snapshot = state.focusSnapshot
        if (!snapshot || snapshot.type !== 'act') return

        set({
            editingActId: null,
            selectedActPerformerKey: null,
            focusSnapshot: null,
            performers: state.performers.map((p) => ({
                ...p,
                hidden: snapshot.hiddenPerformerIds.includes(p.id),
            })),
            markdownEditors: state.markdownEditors.map((e) => ({
                ...e,
                hidden: snapshot.hiddenEditorIds.includes(e.id),
            })),
            isAssetLibraryOpen: snapshot.assetLibraryOpen,
            isAssistantOpen: snapshot.assistantOpen,
            isTerminalOpen: snapshot.terminalOpen,
        })
    },

    // ── Authoring / import ──────────────────────────────

    updateActAuthoringMeta: (id, meta) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, meta: { ...a.meta, ...meta } } : a)),
            stageDirty: true,
        }))
    },

    importActFromAsset: (asset) => {
        const id = nanoid(12)
        const center = get().canvasCenter

        // Build performer bindings from asset
        const performers: Record<string, StageActPerformerBinding> = {}
        const idMapping: Record<string, string> = {}

        const nodes: any[] = Array.isArray(asset.performers)
            ? asset.performers
            : typeof asset.performers === 'object' && asset.performers
                ? Object.values(asset.performers)
                : []

        for (const node of nodes) {
            const newKey = nanoid(8)
            const oldId = node.id || node.name || newKey
            idMapping[oldId] = newKey

            // Build performer ref
            const performerRef = node.performerRef || (node.urn
                ? { kind: 'registry' as const, urn: node.urn }
                : node.draftId
                    ? { kind: 'draft' as const, draftId: node.draftId }
                    : { kind: 'draft' as const, draftId: '' })

            performers[newKey] = {
                performerRef,
                activeDanceIds: node.activeDanceIds,
                subscriptions: node.subscriptions,
                position: { x: Object.keys(performers).length * 300, y: 100 },
            }
        }

        // Build relations from asset
        const rawRelations: any[] = Array.isArray(asset.relations) ? asset.relations : []
        const relations: ActRelation[] = rawRelations.map((r: any) => ({
            id: nanoid(8),
            between: [
                idMapping[r.between?.[0]] || r.between?.[0] || '',
                idMapping[r.between?.[1]] || r.between?.[1] || '',
            ] as [string, string],
            direction: r.direction || 'both' as const,
            name: r.name || `rel_${nanoid(6)}`,
            description: r.description,
            permissions: r.permissions,
            maxCalls: r.maxCalls ?? 10,
            timeout: r.timeout ?? 300,
            sessionPolicy: r.sessionPolicy,
        }))

        const newAct: StageAct = {
            id,
            name: asset.name || `Act ${get().acts.length + 1}`,
            description: asset.description,
            actRules: asset.actRules,
            performers,
            relations,
            position: { x: (center?.x ?? 400) - ACT_DEFAULT_WIDTH / 2, y: center?.y ?? 300 },
            width: ACT_DEFAULT_WIDTH,
            height: ACT_DEFAULT_HEIGHT,
            createdAt: Date.now(),
            meta: {
                derivedFrom: asset.urn || null,
                authoring: {
                    description: asset.description || '',
                },
            },
        }

        set((s) => ({
            acts: [...s.acts, newAct],
            selectedActId: id,
            stageDirty: true,
        }))
    },

    // ── Thread management ────────────────────────────────

    createThread: async (actId) => {
        const act = get().acts.find((a) => a.id === actId)
        // Build ActDefinition to send to server for tool projection
        const actDefinition = act ? {
            id: act.id,
            name: act.name,
            description: act.description,
            actRules: act.actRules,
            performers: Object.fromEntries(
                Object.entries(act.performers).map(([key, binding]) => [key, {
                    performerRef: binding.performerRef,
                    activeDanceIds: binding.activeDanceIds,
                    subscriptions: binding.subscriptions,
                }]),
            ),
            relations: act.relations,
        } : undefined

        const result = await api.actRuntime.createThread(actId, actDefinition)
        const thread = result.thread
        set((s) => ({
            actThreads: {
                ...s.actThreads,
                [actId]: [
                    ...(s.actThreads[actId] || []),
                    {
                        id: thread.id,
                        actId: thread.actId,
                        status: thread.status as any,
                        performerSessions: {},
                        createdAt: thread.createdAt,
                    },
                ],
            },
            activeThreadId: thread.id,
        }))
        return thread.id
    },

    selectThread: (threadId) => {
        set({ activeThreadId: threadId, activeThreadPerformerKey: null })
    },

    selectThreadPerformer: (performerKey) => {
        set({ activeThreadPerformerKey: performerKey })
    },

    loadThreads: async (actId) => {
        const result = await api.actRuntime.listThreads(actId)
        set((s) => ({
            actThreads: {
                ...s.actThreads,
                [actId]: result.threads.map((t) => ({
                    id: t.id,
                    actId: t.actId,
                    status: t.status as any,
                    performerSessions: t.performerSessions || {},
                    createdAt: t.createdAt,
                })),
            },
        }))
    },
})
