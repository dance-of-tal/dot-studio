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

    const ref = binding.performerRef
    if (ref.kind === 'draft') {
        return performers.find((performer) => performer.id === ref.draftId)?.name || participantKey
    }

    return performers.find((performer) => performer.meta?.derivedFrom === ref.urn)?.name
        || fallbackLabelFromRegistryUrn(ref.urn)
        || participantKey
}
