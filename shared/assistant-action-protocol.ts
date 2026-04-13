import type {
    AssistantAction,
    AssistantActionEnvelope,
    AssistantParticipantSubscriptionsInput,
    AssistantPerformerFields,
} from './assistant-actions.js'
import { normalizeAssistantBundlePath } from './assistant-bundle-path.js'

type ActionRecord = Record<string, unknown>
type DraftRefKind = 'tal' | 'dance'

export interface AssistantActionLintIssue {
    level: 'error' | 'warning'
    actionIndex: number
    message: string
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

function normalizeOptionalString(value: unknown, options?: { allowNull?: boolean }) {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed ? trimmed : undefined
    }
    if (options?.allowNull && value === null) {
        return null
    }
    return value === undefined ? undefined : value
}

function normalizeOptionalStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return value === undefined ? undefined : value
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
        .filter((entry) => entry !== '')
}

function normalizeDraftBlueprintCandidate(value: unknown) {
    if (!isRecord(value)) {
        return value === undefined ? undefined : value
    }

    const normalizedTags = normalizeOptionalStringArray(value.tags)
    const normalized: Record<string, unknown> = {
        ...(normalizeOptionalString(value.ref) !== undefined ? { ref: normalizeOptionalString(value.ref) } : {}),
        ...(normalizeOptionalString(value.name) !== undefined ? { name: normalizeOptionalString(value.name) } : {}),
        ...(normalizeOptionalString(value.content) !== undefined ? { content: normalizeOptionalString(value.content) } : {}),
        ...(normalizeOptionalString(value.slug) !== undefined ? { slug: normalizeOptionalString(value.slug) } : {}),
        ...(normalizeOptionalString(value.description) !== undefined ? { description: normalizeOptionalString(value.description) } : {}),
        ...(Array.isArray(normalizedTags) && normalizedTags.length > 0 ? { tags: normalizedTags } : {}),
        ...(value.openEditor === true ? { openEditor: true } : {}),
    }

    return Object.keys(normalized).length === 0 ? undefined : normalized
}

function hasMeaningfulDraftBlueprint(value: unknown) {
    return isRecord(normalizeDraftBlueprintCandidate(value))
}

function normalizeModelBlueprintCandidate(value: unknown) {
    if (!isRecord(value)) {
        return value === undefined || value === null ? value : value
    }

    const provider = normalizeOptionalString(value.provider)
    const modelId = normalizeOptionalString(value.modelId)
    if (!provider && !modelId) {
        return undefined
    }

    return {
        ...(provider !== undefined ? { provider } : {}),
        ...(modelId !== undefined ? { modelId } : {}),
    }
}

function normalizeRelationBlueprintCandidate(value: unknown) {
    if (!isRecord(value)) {
        return value === undefined ? undefined : value
    }

    return {
        ...value,
        sourceParticipantKey: normalizeOptionalString(value.sourceParticipantKey),
        sourcePerformerId: normalizeOptionalString(value.sourcePerformerId),
        sourcePerformerRef: normalizeOptionalString(value.sourcePerformerRef),
        sourcePerformerName: normalizeOptionalString(value.sourcePerformerName),
        targetParticipantKey: normalizeOptionalString(value.targetParticipantKey),
        targetPerformerId: normalizeOptionalString(value.targetPerformerId),
        targetPerformerRef: normalizeOptionalString(value.targetPerformerRef),
        targetPerformerName: normalizeOptionalString(value.targetPerformerName),
        name: normalizeOptionalString(value.name),
        description: normalizeOptionalString(value.description),
    }
}

function normalizePerformerActionCandidate(action: ActionRecord) {
    const normalizedTalDraftId = normalizeOptionalString(action.talDraftId)
    const normalizedTalDraftRef = normalizeOptionalString(action.talDraftRef)
    const normalizedTalDraft = normalizeDraftBlueprintCandidate(action.talDraft)
    const normalizedTalUrn = normalizeOptionalString(action.talUrn, { allowNull: true })

    return {
        ...action,
        model: normalizeModelBlueprintCandidate(action.model),
        description: normalizeOptionalString(action.description, { allowNull: true }),
        talUrn: normalizedTalUrn === null && (
            isNonEmptyString(normalizedTalDraftId)
            || isNonEmptyString(normalizedTalDraftRef)
            || hasMeaningfulDraftBlueprint(normalizedTalDraft)
        )
            ? undefined
            : normalizedTalUrn,
        talDraftId: normalizedTalDraftId,
        talDraftRef: normalizedTalDraftRef,
        talDraft: normalizedTalDraft,
        addDanceUrns: normalizeOptionalStringArray(action.addDanceUrns),
        addDanceDraftIds: normalizeOptionalStringArray(action.addDanceDraftIds),
        addDanceDraftRefs: normalizeOptionalStringArray(action.addDanceDraftRefs),
        addDanceDrafts: Array.isArray(action.addDanceDrafts)
            ? action.addDanceDrafts
                .map((draft) => normalizeDraftBlueprintCandidate(draft))
                .filter((draft) => draft !== undefined)
            : action.addDanceDrafts,
        removeDanceUrns: normalizeOptionalStringArray(action.removeDanceUrns),
        removeDanceDraftIds: normalizeOptionalStringArray(action.removeDanceDraftIds),
        addMcpServerNames: normalizeOptionalStringArray(action.addMcpServerNames),
        removeMcpServerNames: normalizeOptionalStringArray(action.removeMcpServerNames),
    }
}

function normalizeAssistantActionCandidate(action: unknown): unknown {
    if (!isRecord(action) || !isNonEmptyString(action.type)) {
        return action
    }

    switch (action.type) {
        case 'createPerformer':
        case 'updatePerformer':
            return normalizePerformerActionCandidate(action)
        case 'createAct':
            return {
                ...action,
                description: normalizeOptionalString(action.description),
                actRules: normalizeOptionalStringArray(action.actRules),
                participantPerformerIds: normalizeOptionalStringArray(action.participantPerformerIds),
                participantPerformerRefs: normalizeOptionalStringArray(action.participantPerformerRefs),
                participantPerformerNames: normalizeOptionalStringArray(action.participantPerformerNames),
                relations: Array.isArray(action.relations)
                    ? action.relations
                        .map((relation) => normalizeRelationBlueprintCandidate(relation))
                        .filter((relation) => relation !== undefined)
                    : action.relations,
            }
        case 'connectPerformers':
            return normalizeRelationBlueprintCandidate(action)
        default:
            return action
    }
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

function normalizeAssistantActionEnvelopeCandidate(input: unknown): { version?: unknown; actions?: unknown } | null {
    if (typeof input === 'string') {
        const trimmed = input.trim()
        if (!trimmed) {
            return null
        }

        try {
            const parsed = JSON.parse(trimmed)
            return parsed && typeof parsed === 'object'
                ? parsed as { version?: unknown; actions?: unknown }
                : null
        } catch {
            return null
        }
    }

    if (!input || typeof input !== 'object') {
        return null
    }

    return input as { version?: unknown; actions?: unknown }
}

export function parseAssistantActionEnvelope(input: unknown): AssistantActionEnvelope | null {
    const candidate = normalizeAssistantActionEnvelopeCandidate(input)
    if (!candidate) {
        return null
    }

    if (candidate.version !== 1 || !Array.isArray(candidate.actions)) {
        return null
    }

    const normalizedActions = candidate.actions.map((action) => normalizeAssistantActionCandidate(action))

    if (!normalizedActions.every((action) => isValidAssistantAction(action))) {
        return null
    }
    return {
        version: 1,
        actions: normalizedActions as AssistantAction[],
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
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is declared more than once in the same tool call.`)
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
            `draft ref "${value}" is already declared for a ${existingKind} draft earlier in the same tool call.`,
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
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is used before it is created in the same tool call.`)
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
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" is used before it is created in the same tool call.`)
        return
    }
    if (existingKind !== kind) {
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" resolves to a ${existingKind} draft in the same tool call.`)
    }
}

function lintPerformerFields(
    actionIndex: number,
    fields: ActionRecord,
    refState: RefState,
    issues: AssistantActionLintIssue[],
) {
    const talSelectorCount = [
        isNonEmptyString(fields.talUrn) || fields.talUrn === null,
        isNonEmptyString(fields.talDraftId),
        isNonEmptyString(fields.talDraftRef),
        hasMeaningfulDraftBlueprint(fields.talDraft),
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
    const talDraft = normalizeDraftBlueprintCandidate(fields.talDraft)
    if (isRecord(talDraft)) {
        registerDraftRef(issues, actionIndex, refState.drafts, 'tal', talDraft.ref)
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
