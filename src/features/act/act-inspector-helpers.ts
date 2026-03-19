import type { PerformerNode } from '../../types'

export function getCallboardKeys(subscriptions: any) {
    return subscriptions.callboardKeys || []
}

export function nextSubscriptions(subscriptions: any, patch: Record<string, unknown>) {
    return { ...subscriptions, ...patch }
}

export function isPerformerAttachedToAct(act: any, performer: PerformerNode) {
    const derivedFrom = performer.meta?.derivedFrom?.trim()
    return Object.values(act.participants).some((binding: any) => (
        (binding.performerRef.kind === 'draft' && binding.performerRef.draftId === performer.id)
        || (binding.performerRef.kind === 'registry' && !!derivedFrom && binding.performerRef.urn === derivedFrom)
    ))
}
