import type { PerformerNode, StageAct } from '../../types'

function fallbackLabelFromRegistryUrn(urn: string) {
    const lastSegment = urn.split('/').pop() || urn
    return lastSegment.replace(/^@/, '')
}

export function resolveActParticipantLabel(
    act: StageAct | null | undefined,
    performerKey: string,
    performers: PerformerNode[],
) {
    if (!act) return performerKey
    const binding = act.performers[performerKey]
    if (!binding) return performerKey

    if (binding.performerRef.kind === 'draft') {
        return performers.find((performer) => performer.id === binding.performerRef.draftId)?.name || performerKey
    }

    return performers.find((performer) => performer.meta?.derivedFrom === binding.performerRef.urn)?.name
        || fallbackLabelFromRegistryUrn(binding.performerRef.urn)
        || performerKey
}
