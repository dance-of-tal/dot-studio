import type { ParticipantSubscriptions, PerformerNode, WorkspaceAct, WorkspaceActParticipantBinding } from '../../types'

type ParticipantSubscriptionsLike = Pick<ParticipantSubscriptions, 'messagesFrom' | 'messageTags' | 'callboardKeys' | 'eventTypes'>

export function getCallboardKeys(subscriptions: ParticipantSubscriptionsLike | null | undefined) {
    return subscriptions?.callboardKeys || []
}

export function nextSubscriptions(
    subscriptions: ParticipantSubscriptionsLike | null | undefined,
    patch: Partial<ParticipantSubscriptionsLike>,
) {
    return { ...subscriptions, ...patch }
}

export function isPerformerAttachedToAct(act: WorkspaceAct, performer: PerformerNode) {
    const derivedFrom = performer.meta?.derivedFrom?.trim()
    return Object.values(act.participants).some((binding: WorkspaceActParticipantBinding) => (
        (binding.performerRef.kind === 'draft' && binding.performerRef.draftId === performer.id)
        || (binding.performerRef.kind === 'registry' && !!derivedFrom && binding.performerRef.urn === derivedFrom)
    ))
}
