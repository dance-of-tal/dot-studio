import type { StageActParticipantBinding, ActRelation } from '../types'
import type { StudioState } from './types'
import { autoLayoutBindings, fallbackParticipantLabel } from './act-slice-helpers'

type SetState = (partial: any) => void
type GetState = () => StudioState

export function addActRelationImpl(
    get: GetState,
    set: SetState,
    actId: string,
    between: [string, string],
    direction: 'both' | 'one-way',
) {
    const act = get().acts.find((entry) => entry.id === actId)
    const performers = get().performers
    const leftBinding = act?.participants[between[0]]
    const rightBinding = act?.participants[between[1]]
    const leftRef = leftBinding?.performerRef
    const rightRef = rightBinding?.performerRef
    const leftLabel = leftRef
        ? (leftRef.kind === 'draft'
            ? performers.find((performer) => performer.id === leftRef.draftId)?.name || fallbackParticipantLabel(leftRef)
            : performers.find((performer) => performer.meta?.derivedFrom === leftRef.urn)?.name || fallbackParticipantLabel(leftRef))
        : between[0]
    const rightLabel = rightRef
        ? (rightRef.kind === 'draft'
            ? performers.find((performer) => performer.id === rightRef.draftId)?.name || fallbackParticipantLabel(rightRef)
            : performers.find((performer) => performer.meta?.derivedFrom === rightRef.urn)?.name || fallbackParticipantLabel(rightRef))
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
    set((state: StudioState) => ({
        acts: state.acts.map((entry) => {
            if (entry.id !== actId) return entry
            const existing = entry.relations.find(
                (item) =>
                    (item.between[0] === between[0] && item.between[1] === between[1]) ||
                    (item.between[0] === between[1] && item.between[1] === between[0]),
            )
            if (existing) {
                existingRelationId = existing.id
                return entry
            }
            inserted = true
            return { ...entry, relations: [...entry.relations, relation] }
        }),
        stageDirty: true,
    }))
    return inserted ? relation.id : existingRelationId
}



export function createActFromPerformersImpl(
    get: GetState,
    set: SetState,
    performerIds: [string, string],
    options?: { name?: string },
    dimensions?: { width: number; height: number },
) {
    const [sourcePerformerId, targetPerformerId] = performerIds
    if (!sourcePerformerId || !targetPerformerId || sourcePerformerId === targetPerformerId) {
        return null
    }

    const state = get()
    const sourcePerformer = state.performers.find((performer) => performer.id === sourcePerformerId)
    const targetPerformer = state.performers.find((performer) => performer.id === targetPerformerId)
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

    const findBindingInAct = (act: any, performerId: string) => (
        Object.entries(act.participants).find(([, binding]) => (
            bindingMatchesPerformer(
                binding as StageActParticipantBinding,
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
            set({
                selectedActId: sourceMatch.act.id,
                selectedPerformerId: null,
                actEditorState: null,
            })
            return sourceMatch.act.id
        }

        const sourceKey = sourceMatch.binding?.[0]
        const targetKey = targetMatch.binding?.[0]
        if (sourceKey && targetKey) {
            addActRelationImpl(get, set, sourceMatch.act.id, [sourceKey, targetKey], 'both')
            set({
                selectedActId: sourceMatch.act.id,
                selectedPerformerId: null,
                actEditorState: null,
            })
            return sourceMatch.act.id
        }
    }

    if (sourceMatch && !targetMatch) {
        const targetKey = get().bindPerformerToAct(sourceMatch.act.id, performerToRef(targetPerformer))
        const sourceKey = sourceMatch.binding?.[0]
        if (sourceKey && targetKey) {
            addActRelationImpl(get, set, sourceMatch.act.id, [sourceKey, targetKey], 'both')
        }
        set({
            selectedActId: sourceMatch.act.id,
            selectedPerformerId: null,
            actEditorState: null,
        })
        return sourceMatch.act.id
    }

    if (!sourceMatch && targetMatch) {
        const sourceKey = get().bindPerformerToAct(targetMatch.act.id, performerToRef(sourcePerformer))
        const targetKey = targetMatch.binding?.[0]
        if (sourceKey && targetKey) {
            addActRelationImpl(get, set, targetMatch.act.id, [sourceKey, targetKey], 'both')
        }
        set({
            selectedActId: targetMatch.act.id,
            selectedPerformerId: null,
            actEditorState: null,
        })
        return targetMatch.act.id
    }

    const width = dimensions?.width ?? 340
    const height = dimensions?.height ?? 320
    const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const sourceKey = `p-${Math.random().toString(36).slice(2, 8)}`
    const targetKey = `p-${Math.random().toString(36).slice(2, 8)}`
    const actName = options?.name?.trim() || `${sourcePerformer.name} + ${targetPerformer.name}`
    const initialRelationId = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const act = {
        id,
        name: actName,
        position: {
            x: Math.round((sourcePerformer.position.x + targetPerformer.position.x) / 2 + 120),
            y: Math.round((sourcePerformer.position.y + targetPerformer.position.y) / 2 + 40),
        },
        width,
        height,
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
            direction: 'both' as const,
            name: `${sourcePerformer.name}_to_${targetPerformer.name}`,
            maxCalls: 10,
            timeout: 300,
        }],
        createdAt: Date.now(),
    }

    set((state: StudioState) => ({
        acts: [...state.acts, act],
        selectedActId: id,
        selectedPerformerId: null,
        actEditorState: null,
        stageDirty: true,
    }))
    return id
}
