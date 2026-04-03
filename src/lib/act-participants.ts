import type { PerformerNode, WorkspaceAct, WorkspaceActParticipantBinding } from '../types'

export function performerByRegistryUrn(performers: PerformerNode[], urn: string): PerformerNode | null {
    return performers.find((performer) => performer.meta?.derivedFrom === urn) || null
}

export function performerByDraftId(performers: PerformerNode[], draftId: string): PerformerNode | null {
    return performers.find((performer) =>
        performer.id === draftId
        || performer.meta?.derivedFrom === `draft:${draftId}`,
    ) || null
}

export function resolvePerformerFromActBinding(
    performers: PerformerNode[],
    binding: WorkspaceActParticipantBinding | null | undefined,
): PerformerNode | null {
    if (!binding) {
        return null
    }

    return binding.performerRef.kind === 'draft'
        ? performerByDraftId(performers, binding.performerRef.draftId)
        : performerByRegistryUrn(performers, binding.performerRef.urn)
}

export function resolveActParticipantPerformer(
    act: WorkspaceAct | null | undefined,
    participantKey: string | null,
    performers: PerformerNode[],
) {
    if (!act || !participantKey) {
        return null
    }

    return resolvePerformerFromActBinding(performers, act.participants[participantKey])
}

export function describeActParticipantRef(binding: WorkspaceActParticipantBinding | null | undefined, fallbackKey: string) {
    if (!binding) {
        return fallbackKey
    }

    return binding.performerRef.kind === 'registry'
        ? binding.performerRef.urn
        : binding.performerRef.draftId
}
