import type { AssetRef, DraftAsset, PerformerNode, WorkspaceAct } from '../types'
import type { StudioState } from './types'

function sortRecord<T>(record: Record<string, T> | null | undefined) {
    return Object.fromEntries(
        Object.entries(record || {}).sort(([left], [right]) => left.localeCompare(right)),
    )
}

function serializeAssetRef(ref: AssetRef | null | undefined) {
    if (!ref) {
        return null
    }
    return ref.kind === 'draft'
        ? { kind: 'draft', draftId: ref.draftId }
        : { kind: 'registry', urn: ref.urn }
}

function serializePerformer(performer: PerformerNode) {
    return {
        id: performer.id,
        name: performer.name,
        talRef: serializeAssetRef(performer.talRef),
        danceRefs: (performer.danceRefs || []).map(serializeAssetRef),
        model: performer.model
            ? { provider: performer.model.provider, modelId: performer.model.modelId }
            : null,
        modelVariant: performer.modelVariant || null,
        modelPlaceholder: performer.modelPlaceholder
            ? { provider: performer.modelPlaceholder.provider, modelId: performer.modelPlaceholder.modelId }
            : null,
        agentId: performer.agentId || null,
        planMode: !!performer.planMode,
        danceDeliveryMode: performer.danceDeliveryMode || 'auto',
        mcpServerNames: [...(performer.mcpServerNames || [])].sort(),
        mcpBindingMap: sortRecord(performer.mcpBindingMap || {}),
        declaredMcpConfig: performer.declaredMcpConfig || null,
        meta: performer.meta
            ? {
                derivedFrom: performer.meta.derivedFrom || null,
                authoring: performer.meta.authoring || null,
            }
            : null,
    }
}

function serializeAct(act: WorkspaceAct) {
    return {
        id: act.id,
        name: act.name,
        description: act.description || '',
        actRules: act.actRules || [],
        participants: Object.fromEntries(
            Object.entries(act.participants || {})
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, binding]) => [
                    key,
                    {
                        performerRef: serializeAssetRef(binding.performerRef),
                        displayName: binding.displayName || '',
                        subscriptions: binding.subscriptions || null,
                    },
                ]),
        ),
        relations: act.relations || [],
        safety: act.safety || null,
        meta: act.meta
            ? {
                derivedFrom: act.meta.derivedFrom || null,
                authoring: act.meta.authoring || null,
            }
            : null,
    }
}

function serializeDraft(draft: DraftAsset) {
    return {
        id: draft.id,
        kind: draft.kind,
        name: draft.name,
        slug: draft.slug || '',
        description: draft.description || '',
        tags: draft.tags || [],
        derivedFrom: draft.derivedFrom || null,
        content: draft.content,
    }
}

export function buildRuntimeReloadSignature(
    state: Pick<StudioState, 'performers' | 'acts' | 'drafts'>,
) {
    return JSON.stringify({
        performers: [...(state.performers || [])]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(serializePerformer),
        acts: [...(state.acts || [])]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(serializeAct),
        drafts: Object.values(state.drafts || {})
            .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
            .map(serializeDraft),
    })
}

export function hasRunningStudioSessions(
    state: Pick<StudioState, 'loadingPerformerId' | 'sessionLoading' | 'seStatuses'>,
) {
    if (Object.values(state.sessionLoading || {}).some(Boolean)) {
        return true
    }

    return Object.values(state.seStatuses || {}).some((status) => status.type === 'busy' || status.type === 'retry')
}
