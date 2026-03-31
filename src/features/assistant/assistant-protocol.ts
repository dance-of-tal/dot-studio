import type {
    AssistantAction,
    AssistantActionEnvelope,
    AssistantParticipantSubscriptionsInput,
    AssistantPerformerFields,
} from '../../../shared/assistant-actions'
import { normalizeAssistantBundlePath } from '../../../shared/assistant-bundle-path'
import type { ChatMessage } from '../../types'

const ACTION_BLOCK_PATTERN = /<assistant-actions>\s*([\s\S]*?)\s*<\/assistant-actions>/i

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isOptionalStringArray(value: unknown) {
    return value === undefined || (
        Array.isArray(value) && value.every((entry) => isNonEmptyString(entry))
    )
}

function isOptionalEventTypeArray(value: unknown) {
    return value === undefined || (
        Array.isArray(value) && value.every((entry) => entry === 'runtime.idle')
    )
}

function isDraftBlueprint(value: unknown) {
    if (!isRecord(value)) return false
    return (
        isNonEmptyString(value.name)
        && isNonEmptyString(value.content)
        && (value.ref === undefined || isNonEmptyString(value.ref))
        && (value.slug === undefined || isNonEmptyString(value.slug))
        && (value.description === undefined || isNonEmptyString(value.description))
        && isOptionalStringArray(value.tags)
        && (value.openEditor === undefined || typeof value.openEditor === 'boolean')
    )
}

function isModelBlueprint(value: unknown) {
    return isRecord(value) && isNonEmptyString(value.provider) && isNonEmptyString(value.modelId)
}

function isParticipantSubscriptionsInput(value: unknown): value is AssistantParticipantSubscriptionsInput {
    if (!isRecord(value)) return false
    return (
        isOptionalStringArray(value.messagesFromParticipantKeys)
        && isOptionalStringArray(value.messagesFromPerformerIds)
        && isOptionalStringArray(value.messagesFromPerformerRefs)
        && isOptionalStringArray(value.messagesFromPerformerNames)
        && isOptionalStringArray(value.messageTags)
        && isOptionalStringArray(value.callboardKeys)
        && isOptionalEventTypeArray(value.eventTypes)
    )
}

function hasActLocator(action: Record<string, unknown>) {
    return isNonEmptyString(action.actId) || isNonEmptyString(action.actRef) || isNonEmptyString(action.actName)
}

function hasPerformerLocator(action: Record<string, unknown>) {
    return isNonEmptyString(action.performerId) || isNonEmptyString(action.performerRef) || isNonEmptyString(action.performerName)
}

function hasParticipantLocator(prefix: 'source' | 'target', action: Record<string, unknown>) {
    const participantKey = action[`${prefix}ParticipantKey`]
    const performerId = action[`${prefix}PerformerId`]
    const performerRef = action[`${prefix}PerformerRef`]
    const performerName = action[`${prefix}PerformerName`]

    return (
        isNonEmptyString(participantKey)
        || isNonEmptyString(performerId)
        || isNonEmptyString(performerRef)
        || isNonEmptyString(performerName)
    )
}

function isPerformerFields(value: unknown): value is AssistantPerformerFields {
    if (!isRecord(value)) return false
    return (
        (value.model === undefined || value.model === null || isModelBlueprint(value.model))
        && (value.talUrn === undefined || value.talUrn === null || isNonEmptyString(value.talUrn))
        && (value.talDraftId === undefined || isNonEmptyString(value.talDraftId))
        && (value.talDraftRef === undefined || isNonEmptyString(value.talDraftRef))
        && (value.talDraft === undefined || isDraftBlueprint(value.talDraft))
        && isOptionalStringArray(value.addDanceUrns)
        && isOptionalStringArray(value.addDanceDraftIds)
        && isOptionalStringArray(value.addDanceDraftRefs)
        && (value.addDanceDrafts === undefined || (Array.isArray(value.addDanceDrafts) && value.addDanceDrafts.every((draft) => isDraftBlueprint(draft))))
        && isOptionalStringArray(value.removeDanceUrns)
        && isOptionalStringArray(value.removeDanceDraftIds)
        && isOptionalStringArray(value.addMcpServerNames)
        && isOptionalStringArray(value.removeMcpServerNames)
    )
}

function isActRelationBlueprint(value: unknown) {
    if (!isRecord(value)) return false
    return (
        hasParticipantLocator('source', value)
        && hasParticipantLocator('target', value)
        && (value.direction === undefined || value.direction === 'both' || value.direction === 'one-way')
        && (value.name === undefined || isNonEmptyString(value.name))
        && (value.description === undefined || isNonEmptyString(value.description))
    )
}

function isValidAssistantAction(action: unknown): action is AssistantAction {
    if (!isRecord(action) || !isNonEmptyString(action.type)) {
        return false
    }

    switch (action.type) {
        case 'installRegistryAsset':
            return isNonEmptyString(action.urn) && (action.scope === undefined || action.scope === 'global' || action.scope === 'stage')
        case 'addDanceFromGitHub':
            return isNonEmptyString(action.source) && (action.scope === undefined || action.scope === 'global' || action.scope === 'stage')
        case 'importInstalledPerformer':
            return isNonEmptyString(action.urn) || isNonEmptyString(action.performerName)
        case 'importInstalledAct':
            return isNonEmptyString(action.urn) || isNonEmptyString(action.actName)
        case 'createTalDraft':
        case 'createDanceDraft':
            return (
                isNonEmptyString(action.name)
                && isNonEmptyString(action.content)
                && (action.slug === undefined || isNonEmptyString(action.slug))
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.tags)
                && (action.openEditor === undefined || typeof action.openEditor === 'boolean')
            )
        case 'updateTalDraft':
        case 'deleteTalDraft':
            return !!resolveDraftLocator(action)
        case 'updateDanceDraft':
        case 'deleteDanceDraft':
            return !!resolveDraftLocator(action)
        case 'upsertDanceBundleFile':
            return !!resolveDraftLocator(action) && hasValidBundlePath(action) && isNonEmptyString(action.content)
        case 'deleteDanceBundleEntry':
            return !!resolveDraftLocator(action) && hasValidBundlePath(action)
        case 'createPerformer':
            return isNonEmptyString(action.name) && isPerformerFields(action)
        case 'updatePerformer':
            return (
                hasPerformerLocator(action)
                && (action.name === undefined || isNonEmptyString(action.name))
                && isPerformerFields(action)
            )
        case 'deletePerformer':
            return hasPerformerLocator(action)
        case 'createAct':
            return (
                isNonEmptyString(action.name)
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.actRules)
                && isOptionalStringArray(action.participantPerformerIds)
                && isOptionalStringArray(action.participantPerformerRefs)
                && isOptionalStringArray(action.participantPerformerNames)
                && (action.relations === undefined || (Array.isArray(action.relations) && action.relations.every((relation) => isActRelationBlueprint(relation))))
            )
        case 'updateAct':
            return (
                hasActLocator(action)
                && (action.name === undefined || isNonEmptyString(action.name))
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.actRules)
            )
        case 'deleteAct':
            return hasActLocator(action)
        case 'attachPerformerToAct':
            return hasActLocator(action) && hasPerformerLocator(action)
        case 'detachParticipantFromAct':
            return hasActLocator(action) && (isNonEmptyString(action.participantKey) || hasPerformerLocator(action))
        case 'updateParticipantSubscriptions':
            return (
                hasActLocator(action)
                && (isNonEmptyString(action.participantKey) || hasPerformerLocator(action))
                && (action.subscriptions === null || isParticipantSubscriptionsInput(action.subscriptions))
            )
        case 'connectPerformers':
            return (
                hasActLocator(action)
                && hasParticipantLocator('source', action)
                && hasParticipantLocator('target', action)
                && (action.direction === undefined || action.direction === 'both' || action.direction === 'one-way')
                && (action.name === undefined || isNonEmptyString(action.name))
                && (action.description === undefined || isNonEmptyString(action.description))
            )
        case 'updateRelation':
        case 'removeRelation':
            return hasActLocator(action) && isNonEmptyString(action.relationId)
        default:
            return false
    }
}

function resolveDraftLocator(action: Record<string, unknown>) {
    return isNonEmptyString(action.draftId) || isNonEmptyString(action.draftRef) || isNonEmptyString(action.draftName)
}

function hasValidBundlePath(action: Record<string, unknown>) {
    return normalizeAssistantBundlePath(typeof action.path === 'string' ? action.path : null) !== null
}

function normalizeEnvelope(input: unknown): AssistantActionEnvelope | null {
    if (!input || typeof input !== 'object') {
        return null
    }
    const candidate = input as { version?: unknown; actions?: unknown }
    if (candidate.version !== 1 || !Array.isArray(candidate.actions)) {
        return null
    }
    if (!candidate.actions.every((action) => isValidAssistantAction(action))) {
        return null
    }
    return {
        version: 1,
        actions: candidate.actions as AssistantAction[],
    }
}

export function extractAssistantActionEnvelope(content: string): {
    content: string
    envelope: AssistantActionEnvelope | null
} {
    const match = content.match(ACTION_BLOCK_PATTERN)
    if (!match) {
        return { content: content.trim(), envelope: null }
    }

    let envelope: AssistantActionEnvelope | null = null
    try {
        envelope = normalizeEnvelope(JSON.parse(match[1]))
    } catch {
        envelope = null
    }

    const cleaned = content.replace(ACTION_BLOCK_PATTERN, '').trim()
    return {
        content: cleaned,
        envelope,
    }
}

export function getAssistantMessageActions(
    message: Pick<ChatMessage, 'content' | 'metadata'>,
): AssistantAction[] {
    if (message.metadata?.assistantActions?.length) {
        return message.metadata.assistantActions
    }
    return extractAssistantActionEnvelope(message.content).envelope?.actions || []
}

export function stripAssistantActionBlock(content: string): string {
    return extractAssistantActionEnvelope(content).content
}
