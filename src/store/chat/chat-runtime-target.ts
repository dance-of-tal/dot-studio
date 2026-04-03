import type {
    AssistantParticipantSubscriptions,
    AssistantStageActParticipantSummary,
    AssistantStageActRelationSummary,
    AssistantStageActSummary,
    AssistantStageContext,
} from '../../../shared/assistant-actions'
import { resolvePerformerRuntimeConfig } from '../../lib/performers'
import { resolvePerformerFromActBinding } from '../../lib/act-participants'
import type { ActRelation, WorkspaceAct, WorkspaceActParticipantBinding } from '../../types'
import { isAssistantChatKey } from '../assistantSlice'
import type { ChatGet } from './chat-internals'

const EMPTY_RUNTIME_CONFIG = {
    talRef: null,
    danceRefs: [],
    model: null,
    modelVariant: null,
    agentId: 'build',
    mcpServerNames: [],
    danceDeliveryMode: 'auto' as const,
    planMode: false,
}

function resolveParticipantSummary(
    get: ChatGet,
    participantKey: string,
    binding: WorkspaceActParticipantBinding,
): AssistantStageActParticipantSummary {
    const performers = get().performers
    const performer = resolvePerformerFromActBinding(performers, binding)

    const subscriptions: AssistantParticipantSubscriptions | undefined = binding.subscriptions
        ? {
            ...(binding.subscriptions.messagesFrom ? { messagesFrom: binding.subscriptions.messagesFrom } : {}),
            ...(binding.subscriptions.messageTags ? { messageTags: binding.subscriptions.messageTags } : {}),
            ...(binding.subscriptions.callboardKeys ? { callboardKeys: binding.subscriptions.callboardKeys } : {}),
            ...(binding.subscriptions.eventTypes ? { eventTypes: binding.subscriptions.eventTypes } : {}),
        }
        : undefined

    return {
        key: participantKey,
        performerName: performer?.name || binding?.displayName || (binding?.performerRef?.kind === 'registry'
            ? binding.performerRef.urn
            : binding?.performerRef?.draftId || participantKey),
        performerId: performer?.id || null,
        displayName: binding.displayName,
        ...(subscriptions ? { subscriptions } : {}),
    }
}

function resolveActSummary(get: ChatGet, act: WorkspaceAct): AssistantStageActSummary {
    const participants = Object.entries(act.participants || {}).map(([key, binding]) =>
        resolveParticipantSummary(get, key, binding),
    )
    const relations: AssistantStageActRelationSummary[] = (act.relations || []).map((relation: ActRelation) => ({
        id: relation.id,
        name: relation.name,
        description: relation.description,
        between: relation.between,
        direction: relation.direction,
    }))

    return {
        id: act.id,
        name: act.name,
        description: act.description,
        actRules: act.actRules,
        participants,
        relations,
    }
}

export function isAssistantPerformerId(performerId: string): boolean {
    return isAssistantChatKey(performerId)
}

export function buildAssistantStageContext(get: ChatGet): AssistantStageContext | null {
    const state = get()
    if (!state.workingDir) {
        return null
    }

    return {
        workingDir: state.workingDir,
        performers: state.performers.map((performer) => ({
            id: performer.id,
            name: performer.name,
            model: performer.model
                ? {
                    provider: performer.model.provider,
                    modelId: performer.model.modelId,
                }
                : null,
            talUrn: performer.talRef?.kind === 'registry' ? performer.talRef.urn : null,
            danceUrns: performer.danceRefs
                .filter((ref) => ref.kind === 'registry')
                .map((ref) => ref.urn),
        })),
        acts: state.acts.map((act) => resolveActSummary(get, act)),
        drafts: Object.values(state.drafts)
            .filter((draft): draft is typeof draft & { kind: 'tal' | 'dance' } =>
                (draft.kind === 'tal' || draft.kind === 'dance') && draft.saveState === 'saved',
            )
            .map((draft) => ({
                id: draft.id,
                kind: draft.kind,
                name: draft.name,
                description: draft.description,
                tags: draft.tags,
            })),
        availableModels: state.assistantAvailableModels.map((model) => ({
            provider: model.provider,
            providerName: model.providerName,
            modelId: model.modelId,
            name: model.name,
        })),
    }
}

export function resolveChatRuntimeTarget(get: ChatGet, performerId: string) {
    const state = get()

    if (isAssistantPerformerId(performerId)) {
        return {
            isAssistant: true,
            name: 'Studio Assistant',
            runtimeConfig: {
                ...EMPTY_RUNTIME_CONFIG,
                model: state.assistantModel
                    ? {
                        provider: state.assistantModel.provider,
                        modelId: state.assistantModel.modelId,
                    }
                    : null,
            },
            assistantContext: buildAssistantStageContext(get),
        }
    }

    const performer = state.performers.find((item) => item.id === performerId) || null
    if (!performer) {
        return null
    }

    return {
        isAssistant: false,
        name: performer.name || 'Untitled Performer',
        runtimeConfig: resolvePerformerRuntimeConfig(performer),
        assistantContext: null,
    }
}
