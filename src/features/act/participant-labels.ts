import type { PerformerNode, StageAct } from '../../types'

function fallbackLabelFromRegistryUrn(urn: string) {
    const lastSegment = urn.split('/').pop() || urn
    return lastSegment.replace(/^@/, '')
}

export function resolveActParticipantLabel(
    act: StageAct | null | undefined,
    participantKey: string,
    performers: PerformerNode[],
) {
    if (!act) return participantKey
    const binding = act.participants[participantKey]
    if (!binding) return participantKey

    if (binding.performerRef.kind === 'draft') {
        return performers.find((performer) => performer.id === binding.performerRef.draftId)?.name || participantKey
    }

    return performers.find((performer) => performer.meta?.derivedFrom === binding.performerRef.urn)?.name
        || fallbackLabelFromRegistryUrn(binding.performerRef.urn)
        || participantKey
}
