// DOT Studio — Act Slice (Choreography Model)
// Act entity: participant ref binding + communication contract relations + canvas position

import { nanoid } from 'nanoid'
import type { StateCreator } from 'zustand'
import type { StudioState, ActSlice } from './types'
import type { StageAct, StageActParticipantBinding, ActRelation } from '../types'
import { api } from '../api'

const ACT_DEFAULT_WIDTH = 340
const ACT_DEFAULT_HEIGHT = 80

function normalizeSubscriptions(subscriptions: any) {
    if (!subscriptions) return subscriptions
    return {
        ...subscriptions,
        ...(subscriptions.callboardKeys ? { callboardKeys: subscriptions.callboardKeys } : {}),
    }
}

function normalizeRelationPermissions(permissions: any) {
    if (!permissions) return permissions
    return {
        ...permissions,
        ...(permissions.callboardKeys ? { callboardKeys: permissions.callboardKeys } : {}),
    }
}

function fallbackParticipantLabel(performerRef: StageActParticipantBinding['performerRef']) {
    if (performerRef.kind === 'draft') {
        return performerRef.draftId
    }
    return performerRef.urn.split('/').pop() || performerRef.urn
}

function autoLayoutBindings(bindings: Record<string, StageActParticipantBinding>) {
    const entries = Object.entries(bindings)
    if (entries.length === 0) return bindings

    const columns = entries.length <= 3 ? entries.length : Math.min(3, Math.ceil(Math.sqrt(entries.length)))
    const gapX = 260
    const gapY = 180

    return Object.fromEntries(entries.map(([key, binding], index) => {
        const col = index % columns
        const row = Math.floor(index / columns)
        return [key, {
            ...binding,
            position: {
                x: 40 + col * gapX,
                y: 120 + row * gapY,
            },
        }]
    }))
}

export const createActSlice: StateCreator<StudioState, [], [], ActSlice> = (set, get) => ({
    acts: [],
    selectedActId: null,
    layoutActId: null,
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
            layoutActId: s.layoutActId === id ? null : s.layoutActId,
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
        if (get().layoutActId !== actId) {
            get().autoLayoutActParticipants(actId)
        }
        set({
            selectedActId: actId,
            selectedPerformerId: null,
            selectedActParticipantKey: relationId ? null : newKey,
            selectedRelationId: relationId,
        })
        return newKey
    },

    createActFromPerformers: (performerIds, options) => {
        const [sourcePerformerId, targetPerformerId] = performerIds
        if (!sourcePerformerId || !targetPerformerId || sourcePerformerId === targetPerformerId) {
            return null
        }

        const state = get()
        const sourcePerformer = state.performers.find((p) => p.id === sourcePerformerId)
        const targetPerformer = state.performers.find((p) => p.id === targetPerformerId)
        if (!sourcePerformer || !targetPerformer) {
            return null
        }

        const performerToRef = (performer: typeof sourcePerformer) => {
            const derivedFrom = performer.meta?.derivedFrom?.trim()
            if (derivedFrom) {
                return { kind: 'registry' as const, urn: derivedFrom }
            }
            return { kind: 'draft' as const, draftId: performer.id }
        }

        const bindingMatchesPerformer = (
            binding: StageActParticipantBinding,
            performerId: string,
            performerUrn?: string | null,
        ) => (
            (binding.performerRef.kind === 'draft' && binding.performerRef.draftId === performerId)
            || (binding.performerRef.kind === 'registry' && !!performerUrn && binding.performerRef.urn === performerUrn)
        )

        const findBindingInAct = (act: StageAct, performerId: string) => (
            Object.entries(act.participants).find(([, binding]) => (
                bindingMatchesPerformer(
                    binding,
                    performerId,
                    performerId === sourcePerformerId ? sourcePerformer.meta?.derivedFrom : targetPerformer.meta?.derivedFrom,
                )
            )) || null
        )

        const sourceMatch = state.acts
            .map((act) => ({ act, binding: findBindingInAct(act, sourcePerformerId) }))
            .find((entry) => !!entry.binding) || null
        const targetMatch = state.acts
            .map((act) => ({ act, binding: findBindingInAct(act, targetPerformerId) }))
            .find((entry) => !!entry.binding) || null

        if (sourceMatch && targetMatch) {
            if (sourceMatch.act.id !== targetMatch.act.id) {
                // Cross-act merge stays explicit in v1.
                set({ selectedActId: sourceMatch.act.id, selectedPerformerId: null })
                return sourceMatch.act.id
            }

            const sourceKey = sourceMatch.binding?.[0]
            const targetKey = targetMatch.binding?.[0]
            if (sourceKey && targetKey) {
                const relationId = get().addRelation(sourceMatch.act.id, [sourceKey, targetKey], 'both')
                set({
                    selectedActId: sourceMatch.act.id,
                    selectedPerformerId: null,
                    selectedActParticipantKey: null,
                    selectedRelationId: relationId,
                })
                return sourceMatch.act.id
            }
        }

        if (sourceMatch && !targetMatch) {
            const targetKey = get().bindPerformerToAct(sourceMatch.act.id, performerToRef(targetPerformer))
            const sourceKey = sourceMatch.binding?.[0]
            let relationId: string | null = null
            if (sourceKey && targetKey) {
                relationId = get().addRelation(sourceMatch.act.id, [sourceKey, targetKey], 'both')
            }
            set({
                selectedActId: sourceMatch.act.id,
                selectedPerformerId: null,
                selectedActParticipantKey: relationId ? null : targetKey,
                selectedRelationId: relationId,
            })
            return sourceMatch.act.id
        }

        if (!sourceMatch && targetMatch) {
            const sourceKey = get().bindPerformerToAct(targetMatch.act.id, performerToRef(sourcePerformer))
            const targetKey = targetMatch.binding?.[0]
            let relationId: string | null = null
            if (sourceKey && targetKey) {
                relationId = get().addRelation(targetMatch.act.id, [sourceKey, targetKey], 'both')
            }
            set({
                selectedActId: targetMatch.act.id,
                selectedPerformerId: null,
                selectedActParticipantKey: relationId ? null : sourceKey,
                selectedRelationId: relationId,
            })
            return targetMatch.act.id
        }

        const id = nanoid(12)
        const sourceKey = nanoid(8)
        const targetKey = nanoid(8)
        const actName = options?.name?.trim() || `${sourcePerformer.name} + ${targetPerformer.name}`
        const initialRelationId = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

        const act: StageAct = {
            id,
            name: actName,
            position: {
                x: Math.round((sourcePerformer.position.x + targetPerformer.position.x) / 2 + 120),
                y: Math.round((sourcePerformer.position.y + targetPerformer.position.y) / 2 + 40),
            },
            width: ACT_DEFAULT_WIDTH,
            height: 320,
            participants: autoLayoutBindings({
                [sourceKey]: {
                    performerRef: performerToRef(sourcePerformer),
                    position: { x: 40, y: 120 },
                },
                [targetKey]: {
                    performerRef: performerToRef(targetPerformer),
                    position: { x: 360, y: 120 },
                },
            }),
            relations: [{
                id: initialRelationId,
                between: [sourceKey, targetKey],
                direction: 'both',
                name: `${sourcePerformer.name}_to_${targetPerformer.name}`,
                maxCalls: 10,
                timeout: 300,
            }],
            createdAt: Date.now(),
        }

        set((s) => ({
            acts: [...s.acts, act],
            selectedActId: id,
            selectedPerformerId: null,
            selectedActParticipantKey: null,
            selectedRelationId: initialRelationId,
            stageDirty: true,
        }))
        return id
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

    addRelation: (actId, between, direction) => {
        const act = get().acts.find((entry) => entry.id === actId)
        const performers = get().performers
        const leftBinding = act?.participants[between[0]]
        const rightBinding = act?.participants[between[1]]
        const leftLabel = leftBinding
            ? (leftBinding.performerRef.kind === 'draft'
                ? performers.find((performer) => performer.id === leftBinding.performerRef.draftId)?.name || fallbackParticipantLabel(leftBinding.performerRef)
                : performers.find((performer) => performer.meta?.derivedFrom === leftBinding.performerRef.urn)?.name || fallbackParticipantLabel(leftBinding.performerRef))
            : between[0]
        const rightLabel = rightBinding
            ? (rightBinding.performerRef.kind === 'draft'
                ? performers.find((performer) => performer.id === rightBinding.performerRef.draftId)?.name || fallbackParticipantLabel(rightBinding.performerRef)
                : performers.find((performer) => performer.meta?.derivedFrom === rightBinding.performerRef.urn)?.name || fallbackParticipantLabel(rightBinding.performerRef))
            : between[1]
        const relation: ActRelation = {
            id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            between,
            direction,
            name: `${leftLabel}_to_${rightLabel}`,
            maxCalls: 10,
            timeout: 300,
        }
        let inserted = false
        let existingRelationId: string | null = null
        set((s) => ({
            acts: s.acts.map((a) => {
                if (a.id !== actId) return a
                // Prevent duplicates (same pair)
                const existing = a.relations.find(
                    (r) =>
                        (r.between[0] === between[0] && r.between[1] === between[1]) ||
                        (r.between[0] === between[1] && r.between[1] === between[0]),
                )
                if (existing) {
                    existingRelationId = existing.id
                    return a
                }
                inserted = true
                return { ...a, relations: [...a.relations, relation] }
            }),
            stageDirty: true,
        }))
        return inserted ? relation.id : existingRelationId
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

    // ── Layout mode for Act editing ─────────────────────

    enterActLayoutMode: (actId) => {
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
            layoutActId: actId,
            selectedActId: actId,
            selectedActParticipantKey: null,
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

    exitActLayoutMode: () => {
        const state = get()
        const snapshot = state.focusSnapshot
        if (!snapshot || snapshot.type !== 'act') return

        set({
            layoutActId: null,
            selectedActParticipantKey: null,
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

        // Build participant bindings from asset
        const participants: Record<string, StageActParticipantBinding> = {}
        const idMapping: Record<string, string> = {}

        const nodes: any[] = Array.isArray(asset.participants)
            ? asset.participants
            : typeof asset.participants === 'object' && asset.participants
                ? Object.values(asset.participants)
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

            participants[newKey] = {
                performerRef,
                activeDanceIds: node.activeDanceIds,
                subscriptions: normalizeSubscriptions(node.subscriptions),
                position: { x: Object.keys(participants).length * 300, y: 100 },
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
            permissions: normalizeRelationPermissions(r.permissions),
            maxCalls: r.maxCalls ?? 10,
            timeout: r.timeout ?? 300,
        }))

        const newAct: StageAct = {
            id,
            name: asset.name || `Act ${get().acts.length + 1}`,
            description: asset.description,
            actRules: asset.actRules,
            participants,
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
            participants: Object.fromEntries(
                Object.entries(act.participants).map(([key, binding]) => [key, {
                    performerRef: binding.performerRef,
                    activeDanceIds: binding.activeDanceIds,
                    subscriptions: normalizeSubscriptions(binding.subscriptions),
                }]),
            ),
            relations: act.relations.map((relation) => ({
                ...relation,
                permissions: normalizeRelationPermissions(relation.permissions),
            })),
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
                        participantSessions: {},
                        createdAt: thread.createdAt,
                    },
                ],
            },
            selectedActId: actId,
            activeThreadId: thread.id,
            activeThreadParticipantKey: null,
        }))
        return thread.id
    },

    selectThread: (threadId) => {
        set({ activeThreadId: threadId, activeThreadParticipantKey: null })
    },

    selectThreadParticipant: (participantKey) => {
        set({ activeThreadParticipantKey: participantKey })
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
                    participantSessions: t.participantSessions || {},
                    createdAt: t.createdAt,
                })),
            },
            activeThreadId: s.selectedActId === actId
                ? ((s.actThreads[actId] || []).some((thread) => thread.id === s.activeThreadId)
                    ? s.activeThreadId
                    : (result.threads[0]?.id || null))
                : s.activeThreadId,
        }))
    },
})
