import type { ActRelation } from '../types'
import type { StudioState } from './types'
import {
    resolveActParticipantName,
    resolveBindingDisplayName,
    scheduleActRuntimeSync,
} from './act-slice-helpers'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
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
    const leftFallbackLabel = leftBinding ? resolveBindingDisplayName(leftBinding, between[0]) : between[0]
    const rightFallbackLabel = rightBinding ? resolveBindingDisplayName(rightBinding, between[1]) : between[1]
    const leftLabel = resolveActParticipantName(performers, leftBinding, leftFallbackLabel)
    const rightLabel = resolveActParticipantName(performers, rightBinding, rightFallbackLabel)

    const relation: ActRelation = {
        id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        between,
        direction,
        name: `${leftLabel}_to_${rightLabel}`,
        description: `Communication relation between ${leftLabel} and ${rightLabel}`,
    }
    let inserted = false
    let existingRelationId: string | null = null
    set((state: StudioState) => ({
        acts: state.acts.map((entry) => {
            if (entry.id !== actId) return entry
            const existing = entry.relations.find(
                (item) => {
                    const sameOrderedPair = item.between[0] === between[0] && item.between[1] === between[1]
                    const sameUnorderedPair =
                        (item.between[0] === between[0] && item.between[1] === between[1])
                        || (item.between[0] === between[1] && item.between[1] === between[0])

                    if (direction === 'both' || item.direction === 'both') {
                        return sameUnorderedPair
                    }

                    return sameOrderedPair && item.direction === direction
                },
            )
            if (existing) {
                existingRelationId = existing.id
                return entry
            }
            inserted = true
            return { ...entry, relations: [...entry.relations, relation] }
        }),
        workspaceDirty: true,
    }))
    if (inserted) {
        get().recordStudioChange({ kind: 'act', actIds: [actId] })
    }
    if (inserted) {
        scheduleActRuntimeSync(get, set, actId)
    }
    return inserted ? relation.id : existingRelationId
}
