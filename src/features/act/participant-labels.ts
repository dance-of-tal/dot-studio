import type { PerformerNode, WorkspaceAct } from '../../types'

/**
 * Resolve a human-readable label for an Act participant.
 * Participant keys are stable Act-local identifiers.
 * The linked performer name is only a display label and may change later.
 */
export function resolveActParticipantLabel(
    act: WorkspaceAct | null | undefined,
    participantKey: string,
    performers: PerformerNode[],
) {
    if (!act) return participantKey
    const binding = act.participants[participantKey]
    if (!binding) return participantKey

    // Prefer the linked performer's current display name when available.
    const ref = binding.performerRef
    if (ref.kind === 'draft') {
        const found = performers.find((performer) => performer.id === ref.draftId)
        if (found?.name?.trim()) return found.name
    } else if (ref.kind === 'registry') {
        const found = performers.find((performer) => performer.meta?.derivedFrom === ref.urn)
        if (found?.name?.trim()) return found.name
    }

    return binding.displayName?.trim() || participantKey
}
