import type {
    AssistantAction,
    AssistantActionEnvelope,
    AssistantParticipantSubscriptionsInput,
    AssistantPerformerFields,
} from './assistant-actions.js'
import { normalizeAssistantBundlePath } from './assistant-bundle-path.js'

const ACTION_BLOCK_PATTERN = /<assistant-actions>\s*([\s\S]*?)\s*<\/assistant-actions>/i

type ActionRecord = Record<string, unknown>
type DraftRefKind = 'tal' | 'dance'

export interface AssistantActionLintIssue {
    level: 'error' | 'warning'
    actionIndex: number
    message: string
}

type AssistantActionMessage = {
    content: string
    metadata?: {
        assistantActions?: AssistantAction[] | null
    } | null
}

type RefState = {
    performers: Set<string>
    acts: Set<string>
    drafts: Map<string, DraftRefKind>
}

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

function isOptionalNullableString(value: unknown) {
    return value === undefined || value === null || isNonEmptyString(value)
}

function isOptionalEventTypeArray(value: unknown) {
    return value === undefined || (
        Array.isArray(value) && value.every((entry) => entry === 'runtime.idle')
    )
}

function isOptionalFiniteNumber(value: unknown) {
    return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
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

function hasActLocator(action: ActionRecord) {
    return isNonEmptyString(action.actId) || isNonEmptyString(action.actRef) || isNonEmptyString(action.actName)
}

function hasPerformerLocator(action: ActionRecord) {
    return isNonEmptyString(action.performerId) || isNonEmptyString(action.performerRef) || isNonEmptyString(action.performerName)
}

function hasParticipantLocator(prefix: 'source' | 'target', action: ActionRecord) {
    return (
        isNonEmptyString(action[`${prefix}ParticipantKey`])
        || isNonEmptyString(action[`${prefix}PerformerId`])
        || isNonEmptyString(action[`${prefix}PerformerRef`])
        || isNonEmptyString(action[`${prefix}PerformerName`])
    )
}

function isActSafetyInput(value: unknown) {
    if (!isRecord(value)) return false
    return (
        isOptionalFiniteNumber(value.maxEvents)
        && isOptionalFiniteNumber(value.maxMessagesPerPair)
        && isOptionalFiniteNumber(value.maxBoardUpdatesPerKey)
        && isOptionalFiniteNumber(value.quietWindowMs)
        && isOptionalFiniteNumber(value.threadTimeoutMs)
        && isOptionalFiniteNumber(value.loopDetectionThreshold)
    )
}

function isPerformerFields(value: unknown): value is AssistantPerformerFields {
    if (!isRecord(value)) return false
    return (
        (value.model === undefined || value.model === null || isModelBlueprint(value.model))
        && isOptionalNullableString(value.description)
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
        && isNonEmptyString(value.name)
        && isNonEmptyString(value.description)
    )
}

function resolveDraftLocator(action: ActionRecord) {
    return isNonEmptyString(action.draftId) || isNonEmptyString(action.draftRef) || isNonEmptyString(action.draftName)
}

function hasValidBundlePath(action: ActionRecord) {
    return normalizeAssistantBundlePath(typeof action.path === 'string' ? action.path : null) !== null
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
                && (action.safety === undefined || isActSafetyInput(action.safety))
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
                && (action.safety === undefined || action.safety === null || isActSafetyInput(action.safety))
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
                && isNonEmptyString(action.name)
                && isNonEmptyString(action.description)
            )
        case 'updateRelation':
        case 'removeRelation':
            return hasActLocator(action) && isNonEmptyString(action.relationId)
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

function parseAssistantActionEnvelopeJson(raw: string): AssistantActionEnvelope | null {
    try {
        return normalizeEnvelope(JSON.parse(raw))
    } catch {
        return null
    }
}

function makeRefState(): RefState {
    return {
        performers: new Set(),
        acts: new Set(),
        drafts: new Map(),
    }
}

function pushIssue(
    issues: AssistantActionLintIssue[],
    level: 'error' | 'warning',
    actionIndex: number,
    message: string,
) {
    issues.push({ level, actionIndex, message })
}

function registerNamedRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Set<string>,
    namespace: string,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    if (refs.has(value)) {
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is declared more than once in the same action block.`)
        return
    }
    refs.add(value)
}

function registerDraftRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Map<string, DraftRefKind>,
    kind: DraftRefKind,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    const existingKind = refs.get(value)
    if (existingKind) {
        pushIssue(
            issues,
            'error',
            actionIndex,
            `draft ref "${value}" is already declared for a ${existingKind} draft earlier in the same action block.`,
        )
        return
    }
    refs.set(value, kind)
}

function requireNamedRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Set<string>,
    namespace: string,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    if (!refs.has(value)) {
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is used before it is created in the same action block.`)
    }
}

function requireDraftRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Map<string, DraftRefKind>,
    kind: DraftRefKind,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    const existingKind = refs.get(value)
    if (!existingKind) {
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" is used before it is created in the same action block.`)
        return
    }
    if (existingKind !== kind) {
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" resolves to a ${existingKind} draft in the same action block.`)
    }
}

function lintPerformerFields(
    actionIndex: number,
    fields: ActionRecord,
    refState: RefState,
    issues: AssistantActionLintIssue[],
) {
    const talSelectorCount = [
        fields.talUrn !== undefined,
        isNonEmptyString(fields.talDraftId),
        isNonEmptyString(fields.talDraftRef),
        isRecord(fields.talDraft),
    ].filter(Boolean).length
    if (talSelectorCount > 1) {
        pushIssue(issues, 'error', actionIndex, 'Performer actions must choose only one Tal source among talUrn, talDraftId, talDraftRef, or talDraft.')
    }

    requireDraftRef(issues, actionIndex, refState.drafts, 'tal', fields.talDraftRef)

    if (Array.isArray(fields.addDanceDraftRefs)) {
        for (const draftRef of fields.addDanceDraftRefs) {
            requireDraftRef(issues, actionIndex, refState.drafts, 'dance', draftRef)
        }
    }
}

function lintRelationRefs(
    actionIndex: number,
    relation: ActionRecord,
    refState: RefState,
    issues: AssistantActionLintIssue[],
) {
    requireNamedRef(issues, actionIndex, refState.performers, 'performer', relation.sourcePerformerRef)
    requireNamedRef(issues, actionIndex, refState.performers, 'performer', relation.targetPerformerRef)
}

function registerInlineDraftRefs(
    actionIndex: number,
    fields: ActionRecord,
    refState: RefState,
    issues: AssistantActionLintIssue[],
) {
    if (isRecord(fields.talDraft)) {
        registerDraftRef(issues, actionIndex, refState.drafts, 'tal', fields.talDraft.ref)
    }
    if (Array.isArray(fields.addDanceDrafts)) {
        for (const draft of fields.addDanceDrafts) {
            if (isRecord(draft)) {
                registerDraftRef(issues, actionIndex, refState.drafts, 'dance', draft.ref)
            }
        }
    }
}

export function lintAssistantActionEnvelope(envelope: AssistantActionEnvelope): AssistantActionLintIssue[] {
    const refState = makeRefState()
    const issues: AssistantActionLintIssue[] = []

    envelope.actions.forEach((action, actionIndex) => {
        const record = action as ActionRecord

        switch (action.type) {
            case 'createTalDraft':
                registerDraftRef(issues, actionIndex, refState.drafts, 'tal', action.ref)
                break
            case 'updateTalDraft':
            case 'deleteTalDraft':
                requireDraftRef(issues, actionIndex, refState.drafts, 'tal', action.draftRef)
                break
            case 'createDanceDraft':
                registerDraftRef(issues, actionIndex, refState.drafts, 'dance', action.ref)
                break
            case 'updateDanceDraft':
            case 'deleteDanceDraft':
            case 'upsertDanceBundleFile':
            case 'deleteDanceBundleEntry':
                requireDraftRef(issues, actionIndex, refState.drafts, 'dance', action.draftRef)
                break
            case 'createPerformer':
                lintPerformerFields(actionIndex, record, refState, issues)
                registerNamedRef(issues, actionIndex, refState.performers, 'performer', action.ref)
                registerInlineDraftRefs(actionIndex, record, refState, issues)
                break
            case 'updatePerformer':
                requireNamedRef(issues, actionIndex, refState.performers, 'performer', action.performerRef)
                lintPerformerFields(actionIndex, record, refState, issues)
                registerInlineDraftRefs(actionIndex, record, refState, issues)
                break
            case 'deletePerformer':
                requireNamedRef(issues, actionIndex, refState.performers, 'performer', action.performerRef)
                break
            case 'createAct': {
                const participantRefCount = action.participantPerformerRefs?.length || 0
                if ((action.relations?.length || 0) === 0 && participantRefCount + (action.participantPerformerIds?.length || 0) + (action.participantPerformerNames?.length || 0) >= 2) {
                    pushIssue(issues, 'warning', actionIndex, 'createAct has multiple participants but no relations. This often produces a disconnected workflow.')
                }
                for (const performerRef of action.participantPerformerRefs || []) {
                    requireNamedRef(issues, actionIndex, refState.performers, 'performer', performerRef)
                }
                for (const relation of action.relations || []) {
                    lintRelationRefs(actionIndex, relation as unknown as ActionRecord, refState, issues)
                }
                registerNamedRef(issues, actionIndex, refState.acts, 'act', action.ref)
                break
            }
            case 'updateAct':
            case 'deleteAct':
                requireNamedRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                break
            case 'attachPerformerToAct':
            case 'detachParticipantFromAct':
            case 'updateParticipantSubscriptions':
                requireNamedRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                requireNamedRef(issues, actionIndex, refState.performers, 'performer', action.performerRef)
                if (action.type === 'updateParticipantSubscriptions' && action.subscriptions && isRecord(action.subscriptions)) {
                    const performerRefs = Array.isArray(action.subscriptions.messagesFromPerformerRefs)
                        ? action.subscriptions.messagesFromPerformerRefs
                        : []
                    for (const performerRef of performerRefs) {
                        requireNamedRef(issues, actionIndex, refState.performers, 'performer', performerRef)
                    }
                }
                break
            case 'connectPerformers':
                requireNamedRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                lintRelationRefs(actionIndex, action as unknown as ActionRecord, refState, issues)
                break
            case 'updateRelation':
            case 'removeRelation':
                requireNamedRef(issues, actionIndex, refState.acts, 'act', action.actRef)
                break
            default:
                break
        }
    })

    return issues
}

export function extractAssistantActionEnvelope(content: string): {
    content: string
    envelope: AssistantActionEnvelope | null
} {
    const match = content.match(ACTION_BLOCK_PATTERN)
    if (!match) {
        const trimmed = content.trim()
        const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
        const candidate = fenced?.[1]?.trim() || trimmed
        const envelope = parseAssistantActionEnvelopeJson(candidate)
        return {
            content: envelope ? '' : trimmed,
            envelope,
        }
    }

    const envelope = parseAssistantActionEnvelopeJson(match[1])

    const cleaned = content.replace(ACTION_BLOCK_PATTERN, '').trim()
    return {
        content: cleaned,
        envelope,
    }
}

export function getAssistantMessageActions(message: AssistantActionMessage): AssistantAction[] {
    if (message.metadata?.assistantActions?.length) {
        return message.metadata.assistantActions
    }
    return extractAssistantActionEnvelope(message.content).envelope?.actions || []
}

export function stripAssistantActionBlock(content: string): string {
    return extractAssistantActionEnvelope(content).content
}
