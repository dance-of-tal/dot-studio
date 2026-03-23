import type { AssistantAction, AssistantActionEnvelope } from '../../../shared/assistant-actions'
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

function isPerformerBlueprint(value: unknown) {
    if (!isRecord(value)) return false
    return (
        isNonEmptyString(value.name)
        && (value.ref === undefined || isNonEmptyString(value.ref))
        && (value.talUrn === undefined || value.talUrn === null || isNonEmptyString(value.talUrn))
        && (value.talDraftId === undefined || isNonEmptyString(value.talDraftId))
        && (value.talDraftRef === undefined || isNonEmptyString(value.talDraftRef))
        && (value.talDraft === undefined || isDraftBlueprint(value.talDraft))
        && isOptionalStringArray(value.danceUrns)
        && isOptionalStringArray(value.danceDraftIds)
        && isOptionalStringArray(value.danceDraftRefs)
        && (value.danceDrafts === undefined || (Array.isArray(value.danceDrafts) && value.danceDrafts.every((draft) => isDraftBlueprint(draft))))
        && (value.model === undefined || value.model === null || isModelBlueprint(value.model))
        && isOptionalStringArray(value.mcpServerNames)
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
        case 'createPerformer':
        case 'createAct':
            return isNonEmptyString(action.name)
        case 'createPerformerBlueprint':
            return isPerformerBlueprint(action)
        case 'createActBlueprint':
            return (
                isNonEmptyString(action.name)
                && (action.ref === undefined || isNonEmptyString(action.ref))
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.participantPerformerIds)
                && isOptionalStringArray(action.participantPerformerRefs)
                && isOptionalStringArray(action.participantPerformerNames)
                && (action.participantBlueprints === undefined || (Array.isArray(action.participantBlueprints) && action.participantBlueprints.every((item) => isPerformerBlueprint(item))))
                && (action.relations === undefined || (Array.isArray(action.relations) && action.relations.every((relation) => isActRelationBlueprint(relation))))
            )
        case 'attachPerformerToAct':
            return hasActLocator(action) && hasPerformerLocator(action)
        case 'connectPerformers':
            return (
                hasActLocator(action)
                && hasParticipantLocator('source', action)
                && hasParticipantLocator('target', action)
                && (action.direction === undefined || action.direction === 'both' || action.direction === 'one-way')
                && (action.name === undefined || isNonEmptyString(action.name))
                && (action.description === undefined || isNonEmptyString(action.description))
            )
        case 'setPerformerModel':
            return hasPerformerLocator(action) && isNonEmptyString(action.provider) && isNonEmptyString(action.modelId)
        case 'setPerformerTal':
            return (
                hasPerformerLocator(action)
                && (
                    action.talUrn === null
                    || isNonEmptyString(action.talUrn)
                    || isNonEmptyString(action.talDraftId)
                    || isNonEmptyString(action.talDraftRef)
                )
            )
        case 'addPerformerDance':
            return (
                hasPerformerLocator(action)
                && (
                    isNonEmptyString(action.danceUrn)
                    || isNonEmptyString(action.danceDraftId)
                    || isNonEmptyString(action.danceDraftRef)
                )
            )
        case 'addPerformerMcp':
            return hasPerformerLocator(action) && isNonEmptyString(action.mcpServerName)
        default:
            return false
    }
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
