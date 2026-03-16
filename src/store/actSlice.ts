// DOT Studio — Act Slice
// Act entity: performer copy management + internal relations + canvas position

import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { StudioState, ActSlice } from './types'
import type { ActPerformer, ActRelation, PerformerNode, StageAct } from '../types'

const ACT_DEFAULT_WIDTH = 340
const ACT_DEFAULT_HEIGHT = 80

function copyPerformerConfig(performer: PerformerNode): ActPerformer {
    return {
        sourcePerformerId: performer.id,
        name: performer.name,
        position: { x: 0, y: 0 },
        talRef: performer.talRef ? { ...performer.talRef } : null,
        danceRefs: performer.danceRefs.map((ref) => ({ ...ref })),
        model: performer.model ? { ...performer.model } : null,
        modelVariant: performer.modelVariant ?? null,
        mcpServerNames: [...performer.mcpServerNames],
        mcpBindingMap: { ...(performer.mcpBindingMap || {}) },
        agentId: performer.agentId ?? null,
        planMode: performer.planMode ?? false,
        danceDeliveryMode: performer.danceDeliveryMode ?? 'inject',
    }
}

export const createActSlice: StateCreator<StudioState, [], [], ActSlice> = (set, get) => ({
    acts: [],
    selectedActId: null,
    editingActId: null,
    selectedActPerformerKey: null,

    addAct: (name) => {
        const id = nanoid(12)
        const center = get().canvasCenter
        const act: StageAct = {
            id,
            name,
            executionMode: 'direct',
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

    setActExecutionMode: (id, mode) => {
        set((s) => ({
            acts: s.acts.map((a) => (a.id === id ? { ...a, executionMode: mode } : a)),
            stageDirty: true,
        }))
    },

    selectAct: (id) => {
        set({ selectedActId: id })
    },

    toggleActEdit: (id) => {
        set((s) => ({
            editingActId: s.editingActId === id ? null : id,
        }))
    },

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

    // ── Performer management (copy-based) ──────────────

    addPerformerToAct: (actId, performerId) => {
        const performer = get().performers.find((p) => p.id === performerId)
        if (!performer) return

        set((s) => {
            const act = s.acts.find((a) => a.id === actId)
            if (!act || act.performers[performerId]) return s  // not found or already in act
            const existingKeys = Object.keys(act.performers)
            const newPos = { x: existingKeys.length * 300, y: 100 }
            return {
                acts: s.acts.map((a) => {
                    if (a.id !== actId) return a
                    return {
                        ...a,
                        performers: {
                            ...a.performers,
                            [performerId]: { ...copyPerformerConfig(performer), position: newPos },
                        },
                    }
                }),
                stageDirty: true,
            }
        })
    },

    addNewPerformerInAct: (actId, name) => {
        const newId = nanoid(12)
        const newPerformer: ActPerformer = {
            sourcePerformerId: '',
            name,
            position: { x: 0, y: 0 },
            talRef: null,
            danceRefs: [],
            model: null,
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            agentId: null,
            planMode: false,
            danceDeliveryMode: 'auto',
        }
        set((s) => {
            const act = s.acts.find((a) => a.id === actId)
            const existingKeys = act ? Object.keys(act.performers) : []
            newPerformer.position = { x: existingKeys.length * 300, y: 100 }
            return {
                acts: s.acts.map((a) => {
                    if (a.id !== actId) return a
                    return {
                        ...a,
                        performers: { ...a.performers, [newId]: newPerformer },
                    }
                }),
                stageDirty: true,
            }
        })
        return newId
    },

    removePerformerFromAct: (actId, performerKey) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                const { [performerKey]: _removed, ...rest } = a.performers
                // Also remove relations involving this performer
                const relations = a.relations.filter(
                    (r) => r.from !== performerKey && r.to !== performerKey,
                )
                return { ...a, performers: rest, relations }
            }),
            stageDirty: true,
        }))
    },

    syncPerformerFromCanvas: (actId, performerKey) => {
        const act = get().acts.find((a) => a.id === actId)
        const actPerformer = act?.performers[performerKey]
        if (!actPerformer) return

        const sourceId = actPerformer.sourcePerformerId
        if (!sourceId) return

        const canvasPerformer = get().performers.find((p) => p.id === sourceId)
        if (!canvasPerformer) return

        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId || !a.performers[performerKey]) return a
                return {
                    ...a,
                    performers: {
                        ...a.performers,
                        [performerKey]: copyPerformerConfig(canvasPerformer),
                    },
                }
            }),
            stageDirty: true,
        }))
    },

    updateActPerformer: (actId, performerKey, update) => {
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

    // ── Focus mode for Act editing ─────────────────────

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
            nodeSize: { width: 0, height: 0 }, // not used for Act focus
            assetLibraryOpen: state.isAssetLibraryOpen,
            assistantOpen: state.isAssistantOpen,
            terminalOpen: state.isTerminalOpen,
        }

        set({
            editingActId: actId,
            selectedActId: actId,
            selectedActPerformerKey: null,
            focusSnapshot,
            // Hide all main canvas nodes
            performers: state.performers.map((p) => ({ ...p, hidden: true })),
            markdownEditors: state.markdownEditors.map((e) => ({ ...e, hidden: true })),
            // Close panels that interfere
            isAssistantOpen: false,
            isTerminalOpen: false,
            // Keep asset library available for DnD
            editingTarget: null,
            inspectorFocus: null,
            // Clear performer focus if active
            focusedPerformerId: null,
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
            // Restore performer hidden states
            performers: state.performers.map((p) => ({
                ...p,
                hidden: snapshot.hiddenPerformerIds.includes(p.id),
            })),
            // Restore markdown editors
            markdownEditors: state.markdownEditors.map((e) => ({
                ...e,
                hidden: snapshot.hiddenEditorIds.includes(e.id),
            })),
            // Restore panels
            isAssetLibraryOpen: snapshot.assetLibraryOpen,
            isAssistantOpen: snapshot.assistantOpen,
            isTerminalOpen: snapshot.terminalOpen,
        })
    },

    selectActPerformer: (key) => {
        set({ selectedActPerformerKey: key })
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

    // ── Relation management (Act-internal edges) ────────

    addRelationInAct: (actId, from, to) => {
        const relation: ActRelation = {
            id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from,
            to,
            interaction: 'request',
            description: '',
        }
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                // Prevent duplicates
                if (a.relations.some((r) => r.from === from && r.to === to)) return a
                return { ...a, relations: [...a.relations, relation] }
            }),
            stageDirty: true,
        }))
    },

    removeRelationFromAct: (actId, relationId) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                return { ...a, relations: a.relations.filter((r) => r.id !== relationId) }
            }),
            stageDirty: true,
        }))
    },

    updateRelationDescription: (actId, relationId, description) => {
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                return {
                    ...a,
                    relations: a.relations.map((r) =>
                        r.id === relationId ? { ...r, description } : r,
                    ),
                }
            }),
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
        const id = nanoid(12)
        const center = get().canvasCenter

        // Build performers from asset nodes
        const performers: Record<string, ActPerformer> = {}
        const idMapping: Record<string, string> = {} // old node id → new key

        const nodes: any[] = Array.isArray(asset.performers)
            ? asset.performers
            : Array.isArray(asset.nodes)
                ? Object.values(asset.nodes)
                : typeof asset.nodes === 'object' && asset.nodes
                    ? Object.values(asset.nodes)
                    : []

        for (const node of nodes) {
            const newKey = nanoid(8)
            const oldId = node.id || node.name || newKey
            idMapping[oldId] = newKey

            performers[newKey] = {
                sourcePerformerId: '',
                name: node.name || `Performer ${Object.keys(performers).length + 1}`,
                position: { x: Object.keys(performers).length * 300, y: 100 },
                talRef: node.talRef || node.talUrn
                    ? (node.talRef || { kind: 'registry' as const, urn: node.talUrn })
                    : null,
                danceRefs: Array.isArray(node.danceRefs)
                    ? node.danceRefs
                    : Array.isArray(node.danceUrns)
                        ? node.danceUrns.map((urn: string) => ({ kind: 'registry' as const, urn }))
                        : [],
                model: node.model || null,
                modelVariant: node.modelVariant ?? null,
                mcpServerNames: Array.isArray(node.mcpServerNames) ? node.mcpServerNames : [],
                mcpBindingMap: node.mcpBindingMap || {},
                agentId: node.agentId ?? null,
                planMode: node.planMode ?? false,
                danceDeliveryMode: node.danceDeliveryMode ?? 'auto',
            }
        }

        // Build relations from asset edges/relations
        const rawRelations: any[] = Array.isArray(asset.relations)
            ? asset.relations
            : Array.isArray(asset.edges)
                ? asset.edges
                : []

        const relations: ActRelation[] = rawRelations.map((r: any) => ({
            id: nanoid(8),
            from: idMapping[r.from] || r.from,
            to: idMapping[r.to] || r.to,
            interaction: r.interaction || 'request',
            description: r.description || '',
        }))

        const newAct: StageAct = {
            id,
            name: asset.name || `Act ${get().acts.length + 1}`,
            executionMode: asset.executionMode || 'direct',
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
})
