import type {
    AssistantParticipantSubscriptions,
    AssistantStageActParticipantSummary,
    AssistantStageActRelationSummary,
    AssistantStageActSummary,
    AssistantStageContext,
} from '../../../shared/assistant-actions'
import { describeChatTarget } from '../../../shared/chat-targets'
import { describeActParticipantRef, resolvePerformerFromActBinding } from '../../lib/act-participants'
import { resolvePerformerRuntimeConfig } from '../../lib/performers'
import type { ActRelation, AssetRef, WorkspaceAct, WorkspaceActParticipantBinding } from '../../types'
import { isAssistantChatKey } from '../assistantSlice'
import type { ChatGet } from './chat-internals'

export type ChatRuntimeConfig = {
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    model: { provider: string; modelId: string } | null
    modelVariant: string | null
    agentId: string
    mcpServerNames: string[]
    planMode: boolean
}

export type ResolvedChatRuntimeTarget = {
    chatKey: string
    kind: 'assistant' | 'performer' | 'act-participant'
    name: string
    runtimeConfig: ChatRuntimeConfig
    assistantContext: AssistantStageContext | null
    executionScope: {
        performerId: string | null
        actId: string | null
        clearPerformerIds: string[]
        clearActIds: string[]
    }
    requestTarget: {
        performerId: string
        performerName: string
        actId?: string
        actThreadId?: string
    }
    notice?: string
}

export const EMPTY_RUNTIME_CONFIG: ChatRuntimeConfig = {
    talRef: null,
    danceRefs: [],
    model: null,
    modelVariant: null,
    agentId: 'build',
    mcpServerNames: [],
    planMode: false,
}

function resolveParticipantSummary(
    get: ChatGet,
    participantKey: string,
    binding: WorkspaceActParticipantBinding,
): AssistantStageActParticipantSummary {
    const performers = get().performers
    const performer = resolvePerformerFromActBinding(performers, binding)
    const description = performer?.meta?.authoring?.description?.trim()

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
        ...(description ? { description } : {}),
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
        safety: act.safety,
        participants,
        relations,
    }
}

export function isAssistantPerformerId(chatKey: string): boolean {
    return isAssistantChatKey(chatKey)
}

export function buildAssistantStageContext(get: ChatGet): AssistantStageContext | null {
    const state = get()
    if (!state.workingDir) {
        return null
    }

    return {
        workingDir: state.workingDir,
        performers: state.performers.map((performer) => {
            const description = performer.meta?.authoring?.description?.trim()
            return {
                id: performer.id,
                name: performer.name,
                ...(description ? { description } : {}),
                model: performer.model
                    ? {
                        provider: performer.model.provider,
                        modelId: performer.model.modelId,
                    }
                    : null,
                talUrn: performer.talRef?.kind === 'registry' ? performer.talRef.urn : null,
                talDraftId: performer.talRef?.kind === 'draft' ? performer.talRef.draftId : null,
                danceUrns: performer.danceRefs
                    .filter((ref) => ref.kind === 'registry')
                    .map((ref) => ref.urn),
                danceDraftIds: performer.danceRefs
                    .filter((ref) => ref.kind === 'draft')
                    .map((ref) => ref.draftId),
            }
        }),
        acts: state.acts.map((act) => resolveActSummary(get, act)),
        drafts: Object.values(state.drafts)
            .filter((draft): draft is typeof draft & { kind: 'tal' | 'dance' } =>
                draft.kind === 'tal' || draft.kind === 'dance',
            )
            .map((draft) => ({
                id: draft.id,
                kind: draft.kind,
                name: draft.name,
                description: draft.description,
                tags: draft.tags,
                saveState: draft.saveState,
            })),
        availableModels: state.assistantAvailableModels.map((model) => ({
            provider: model.provider,
            providerName: model.providerName,
            modelId: model.modelId,
            name: model.name,
        })),
    }
}

export function resolveChatRuntimeTarget(get: ChatGet, chatKey: string): ResolvedChatRuntimeTarget | null {
    const state = get()
    const descriptor = describeChatTarget(chatKey)

    if (descriptor.kind === 'assistant') {
        return {
            chatKey,
            kind: 'assistant',
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
            executionScope: {
                performerId: null,
                actId: null,
                clearPerformerIds: [],
                clearActIds: [],
            },
            requestTarget: {
                performerId: chatKey,
                performerName: 'Studio Assistant',
            },
        }
    }

    if (descriptor.kind === 'act-participant') {
        const act = state.acts.find((entry) => entry.id === descriptor.actId) || null
        const binding = act?.participants[descriptor.participantKey]
        const participantName = binding?.displayName || descriptor.participantKey
        const performer = resolvePerformerFromActBinding(state.performers, binding)

        if (!binding) {
            return {
                chatKey,
                kind: 'act-participant',
                name: participantName,
                runtimeConfig: EMPTY_RUNTIME_CONFIG,
                assistantContext: null,
                executionScope: {
                    performerId: null,
                    actId: descriptor.actId,
                    clearPerformerIds: [],
                    clearActIds: [],
                },
                requestTarget: {
                    performerId: chatKey,
                    performerName: participantName,
                    actId: descriptor.actId,
                    actThreadId: descriptor.threadId,
                },
                notice: `Act participant "${participantName}" is no longer available in this Act.`,
            }
        }

        if (!performer) {
            return {
                chatKey,
                kind: 'act-participant',
                name: participantName,
                runtimeConfig: EMPTY_RUNTIME_CONFIG,
                assistantContext: null,
                executionScope: {
                    performerId: null,
                    actId: descriptor.actId,
                    clearPerformerIds: [],
                    clearActIds: [],
                },
                requestTarget: {
                    performerId: chatKey,
                    performerName: participantName,
                    actId: descriptor.actId,
                    actThreadId: descriptor.threadId,
                },
                notice:
                    `Cannot resolve performer for participant "${participantName}" ` +
                    `(ref: ${describeActParticipantRef(binding, descriptor.participantKey)}). ` +
                    'No matching local performer node found. Try re-importing the Act or creating a performer manually.',
            }
        }

        return {
            chatKey,
            kind: 'act-participant',
            name: performer.name || participantName,
            runtimeConfig: resolvePerformerRuntimeConfig(performer),
            assistantContext: null,
            executionScope: {
                performerId: performer.id,
                actId: descriptor.actId,
                clearPerformerIds: [performer.id],
                clearActIds: [descriptor.actId],
            },
            requestTarget: {
                performerId: chatKey,
                performerName: performer.name || participantName,
                actId: descriptor.actId,
                actThreadId: descriptor.threadId,
            },
        }
    }

    const performer = state.performers.find((item) => item.id === descriptor.performerId) || null
    if (!performer) {
        return null
    }

    return {
        chatKey,
        kind: 'performer',
        name: performer.name || 'Untitled Performer',
        runtimeConfig: resolvePerformerRuntimeConfig(performer),
        assistantContext: null,
        executionScope: {
            performerId: performer.id,
            actId: null,
            clearPerformerIds: [performer.id],
            clearActIds: [],
        },
        requestTarget: {
            performerId: performer.id,
            performerName: performer.name || 'Untitled Performer',
        },
    }
}
