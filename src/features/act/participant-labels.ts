import type { PerformerNode, WorkspaceAct } from '../../types'

/**
 * Resolve a human-readable label for an Act participant.
 * Since participant keys are now performer names (not nanoids),
 * the key itself is the primary label. We still check the canvas
 * performer in case the name was updated after the Act binding.
 */
export function resolveActParticipantLabel(
    act: WorkspaceAct | null | undefined,
    participantKey: string,
    performers: PerformerNode[],
) {
    if (!act) return participantKey
    const binding = act.participants[participantKey]
    if (!binding) return participantKey

    // Check if the linked performer has a newer name (e.g., after rename cascade missed a case)
    const ref = binding.performerRef
    if (ref.kind === 'draft') {
        const found = performers.find((performer) => performer.id === ref.draftId)
        if (found && found.name !== participantKey) return found.name
    } else if (ref.kind === 'registry') {
        const found = performers.find((performer) => performer.meta?.derivedFrom === ref.urn)
        if (found && found.name !== participantKey) return found.name
    }

    // Key is already a readable name
    return participantKey
}
