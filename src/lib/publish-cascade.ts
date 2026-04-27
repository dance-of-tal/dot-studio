import { buildCanonicalStudioAssetUrn, sanitizePublishSegment, stageFromWorkingDir } from '../../shared/publish-stage'
import type { DraftAsset, PerformerNode, WorkspaceAct } from '../types'
import { resolvePerformerFromActBinding } from './act-participants'
import { performerMcpConfigForAsset, slugifyAssetName } from './performers-publish'

type PublishableKind = 'tal' | 'performer' | 'act'

export type ProvidedPublishAsset = {
    kind: PublishableKind
    urn: string
    payload: Record<string, unknown>
    tags?: string[]
}

export type PublishCascadeResult = {
    payload: Record<string, unknown>
    providedAssets: ProvidedPublishAsset[]
}

type PublishContext = {
    drafts: Record<string, DraftAsset>
    username: string
    workingDir: string
    stage?: string
}

type ActPublishContext = PublishContext & {
    performers: PerformerNode[]
}

type PromotedAsset = {
    urn: string
    payload: Record<string, unknown>
}

function filterTags(tags: string[] | undefined | null) {
    return (tags || []).map((tag) => tag.trim()).filter(Boolean)
}

function stageForContext(context: PublishContext) {
    return context.stage ? sanitizePublishSegment(context.stage) : stageFromWorkingDir(context.workingDir)
}

function draftGuidanceForDance(scope: 'performer' | 'act') {
    return scope === 'performer'
        ? 'Draft Dance refs are still attached. Export them, upload them to GitHub, import them from Asset Library, and re-apply them before publishing this performer.'
        : 'Draft Dance refs are still attached inside this act. Export them, upload them to GitHub, import them from Asset Library, and re-apply them before publishing this act.'
}

function pushProvidedAsset(
    collector: Map<string, ProvidedPublishAsset>,
    asset: ProvidedPublishAsset,
) {
    if (!collector.has(asset.urn)) {
        collector.set(asset.urn, asset)
    }
}

function performerPayloadFromResolvedRefs(input: {
    urn: string
    description: string
    tags: string[]
    talUrn?: string
    danceUrns?: string[]
    model?: PerformerNode['model']
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown>
}) {
    return {
        kind: 'performer' as const,
        urn: input.urn,
        description: input.description,
        tags: input.tags,
        payload: {
            ...(input.talUrn ? { tal: input.talUrn } : {}),
            ...(input.danceUrns && input.danceUrns.length > 0 ? { dances: input.danceUrns } : {}),
            ...(input.model ? { model: { provider: input.model.provider, modelId: input.model.modelId } } : {}),
            ...(input.modelVariant ? { modelVariant: input.modelVariant } : {}),
            ...(input.mcpConfig && Object.keys(input.mcpConfig).length > 0 ? { mcp_config: input.mcpConfig } : {}),
        },
    }
}

function actPayloadFromResolvedParticipants(input: {
    urn: string
    description: string
    tags: string[]
    actRules?: string[]
    participants: Array<{
        key: string
        performer: string
        subscriptions?: WorkspaceAct['participants'][string]['subscriptions']
    }>
    relations: WorkspaceAct['relations']
}) {
    return {
        kind: 'act' as const,
        urn: input.urn,
        description: input.description,
        tags: input.tags,
        payload: {
            ...(input.actRules && input.actRules.length > 0 ? { actRules: input.actRules } : {}),
            participants: input.participants,
            relations: input.relations.map((relation) => ({
                between: relation.between,
                direction: relation.direction,
                name: relation.name,
                description: relation.description,
            })),
        },
    }
}

function talPayloadFromDraft(urn: string, draft: DraftAsset) {
    if (typeof draft.content !== 'string' || !draft.content.trim()) {
        throw new Error(`Tal draft '${draft.name || draft.id}' must contain markdown content before publishing.`)
    }

    return {
        kind: 'tal' as const,
        urn,
        description: draft.description?.trim() || draft.name.trim(),
        tags: filterTags(draft.tags),
        payload: {
            content: draft.content,
        },
    }
}

function promoteTalDraft(
    draftId: string,
    context: PublishContext,
    collector: Map<string, ProvidedPublishAsset>,
) {
    const draft = context.drafts[draftId]
    if (!draft || draft.kind !== 'tal') {
        throw new Error(`Tal draft '${draftId}' is missing. Reconnect it from Asset Library before publishing.`)
    }

    const stage = stageForContext(context)
    const slug = draft.slug || slugifyAssetName(draft.name || draftId)
    const urn = buildCanonicalStudioAssetUrn('tal', context.username, stage, slug)
    pushProvidedAsset(collector, {
        kind: 'tal',
        urn,
        payload: talPayloadFromDraft(urn, draft),
        tags: filterTags(draft.tags),
    })
    return urn
}

function promotePerformerNode(
    performer: Pick<PerformerNode, 'name' | 'talRef' | 'danceRefs' | 'model' | 'modelVariant' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig' | 'meta'>,
    options: {
        slug: string
        description?: string
        tags?: string[]
        scope: 'performer' | 'act'
        includeProvidedAsset?: boolean
    },
    context: PublishContext,
    collector: Map<string, ProvidedPublishAsset>,
): PromotedAsset {
    const stage = stageForContext(context)
    const urn = buildCanonicalStudioAssetUrn('performer', context.username, stage, options.slug)
    const talUrn = performer.talRef?.kind === 'registry'
        ? performer.talRef.urn
        : performer.talRef?.kind === 'draft'
            ? promoteTalDraft(performer.talRef.draftId, context, collector)
            : undefined
    const danceUrns = (performer.danceRefs || []).map((ref) => {
        if (ref.kind === 'draft') {
            throw new Error(draftGuidanceForDance(options.scope))
        }
        return ref.urn
    })

    if (!talUrn && danceUrns.length === 0) {
        throw new Error('A performer asset requires at least one Tal or Dance reference.')
    }

    const payload = performerPayloadFromResolvedRefs({
        urn,
        description: options.description?.trim() || performer.name.trim(),
        tags: filterTags(options.tags),
        ...(talUrn ? { talUrn } : {}),
        ...(danceUrns.length > 0 ? { danceUrns } : {}),
        model: performer.model || null,
        modelVariant: performer.modelVariant || null,
        mcpConfig: performerMcpConfigForAsset(performer),
    })

    if (options.includeProvidedAsset) {
        pushProvidedAsset(collector, {
            kind: 'performer',
            urn,
            payload,
            tags: filterTags(options.tags),
        })
    }
    return {
        urn,
        payload,
    }
}

function participantPublishLabel(participantKey: string, participant: WorkspaceAct['participants'][string]) {
    return participant.displayName?.trim() || participantKey
}

function requireDraftParticipantPerformer(
    participantKey: string,
    participant: WorkspaceAct['participants'][string],
    performers: PerformerNode[],
) {
    const performer = resolvePerformerFromActBinding(performers, participant)
    if (!performer) {
        throw new Error(`Participant "${participantPublishLabel(participantKey, participant)}" is missing its performer on the canvas. Re-attach the performer before publishing this act.`)
    }
    return performer
}

function maybePromoteRegistryParticipantPerformer(
    participantUrn: string,
    context: ActPublishContext,
    collector: Map<string, ProvidedPublishAsset>,
) {
    const stage = stageForContext(context)
    const expectedPrefix = `performer/@${context.username}/${stage}/`
    if (!participantUrn.startsWith(expectedPrefix)) {
        return null
    }

    const performer = context.performers.find((candidate) => (
        candidate.meta?.publishBindingUrn?.trim() === participantUrn
        || candidate.meta?.derivedFrom?.trim() === participantUrn
    ))
    if (!performer) {
        return null
    }

    const slug = participantUrn.split('/').pop() || slugifyAssetName(performer.name || 'performer')
    return promotePerformerNode(performer, {
        slug,
        description: performer.meta?.authoring?.description || performer.name,
        tags: performer.meta?.authoring?.tags,
        scope: 'act',
        includeProvidedAsset: true,
    }, context, collector)
}

export function getPerformerPublishBlockReasons(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs'>,
    drafts: Record<string, DraftAsset>,
) {
    const reasons: string[] = []

    if (performer.talRef?.kind === 'draft' && (!drafts[performer.talRef.draftId] || drafts[performer.talRef.draftId]?.kind !== 'tal')) {
        reasons.push('Tal draft is missing. Reconnect it from Asset Library before publishing this performer.')
    }

    if ((performer.danceRefs || []).some((ref) => ref.kind === 'draft')) {
        reasons.push(draftGuidanceForDance('performer'))
    }

    return reasons
}

export function getActPublishDependencyIssues(
    act: WorkspaceAct,
    performers: PerformerNode[],
    drafts: Record<string, DraftAsset>,
) {
    const reasons: string[] = []

    for (const [participantKey, participant] of Object.entries(act.participants)) {
        if (participant.performerRef.kind !== 'draft') continue

        const performer = resolvePerformerFromActBinding(performers, participant)
        const label = participantPublishLabel(participantKey, participant)
        if (!performer) {
            reasons.push(`Participant "${label}" is missing its performer on the canvas. Re-attach the performer before publishing this act.`)
            continue
        }

        if (!performer.talRef && (performer.danceRefs || []).length === 0) {
            reasons.push(`Participant "${label}" needs at least one Tal or Dance before publishing this act.`)
        }

        if (performer.talRef?.kind === 'draft') {
            const talDraft = drafts[performer.talRef.draftId]
            if (!talDraft || talDraft.kind !== 'tal') {
                reasons.push(`Participant "${label}" is missing Tal draft '${performer.talRef.draftId}'. Recreate it before publishing this act.`)
            }
        }
        if ((performer.danceRefs || []).some((ref) => ref.kind === 'draft')) {
            reasons.push(draftGuidanceForDance('act'))
        }
    }

    return Array.from(new Set(reasons))
}

export function buildPerformerPublishPayload(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'model' | 'modelVariant' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
    options: {
        name: string
        slug: string
        description?: string
        tags?: string[]
    },
    context: PublishContext,
): PublishCascadeResult {
    const collector = new Map<string, ProvidedPublishAsset>()
    const promoted = promotePerformerNode({
        ...performer,
        name: options.name,
    }, {
        slug: options.slug,
        description: options.description || options.name,
        tags: options.tags,
        scope: 'performer',
        includeProvidedAsset: false,
    }, context, collector)

    return {
        payload: promoted.payload,
        providedAssets: Array.from(collector.values()),
    }
}

export function buildActPublishPayload(
    act: WorkspaceAct,
    options: {
        slug: string
        description?: string
        tags?: string[]
    },
    context: ActPublishContext,
): PublishCascadeResult {
    const displayNameByKey = Object.fromEntries(
        Object.entries(act.participants).map(([key, binding]) => [key, binding.displayName?.trim() || key]),
    )
    const exportedKeys = Object.values(displayNameByKey)
    if (new Set(exportedKeys).size !== exportedKeys.length) {
        throw new Error('Participant display names must be unique before publishing this act asset.')
    }

    const invalidRelation = act.relations.find((relation) => !relation.description || !relation.description.trim())
    if (invalidRelation) {
        throw new Error(`Relation "${invalidRelation.name}" requires a description before publishing this act asset.`)
    }

    const collector = new Map<string, ProvidedPublishAsset>()
    const stage = stageForContext(context)
    const urn = buildCanonicalStudioAssetUrn('act', context.username, stage, options.slug)

    const participants = Object.entries(act.participants).map(([key, binding]) => {
        if (binding.performerRef.kind === 'registry') {
            const promoted = maybePromoteRegistryParticipantPerformer(binding.performerRef.urn, context, collector)
            return {
                key: displayNameByKey[key] || key,
                performer: promoted?.urn || binding.performerRef.urn,
                ...(binding.subscriptions
                    ? {
                        subscriptions: {
                            ...binding.subscriptions,
                            ...(binding.subscriptions.messagesFrom
                                ? {
                                    messagesFrom: binding.subscriptions.messagesFrom.map((entry) => displayNameByKey[entry] || entry),
                                }
                                : {}),
                        },
                    }
                    : {}),
            }
        }

        const performer = requireDraftParticipantPerformer(key, binding, context.performers)

        return {
            key: displayNameByKey[key] || key,
            performer: promotePerformerNode(performer, {
                slug: performer.meta?.authoring?.slug || slugifyAssetName(performer.name || binding.performerRef.draftId),
                description: performer.meta?.authoring?.description || performer.name,
                tags: performer.meta?.authoring?.tags,
                scope: 'act',
                includeProvidedAsset: true,
            }, context, collector).urn,
            ...(binding.subscriptions
                ? {
                    subscriptions: {
                        ...binding.subscriptions,
                        ...(binding.subscriptions.messagesFrom
                            ? {
                                messagesFrom: binding.subscriptions.messagesFrom.map((entry) => displayNameByKey[entry] || entry),
                            }
                            : {}),
                    },
                }
                : {}),
        }
    })

    const relations = act.relations.map((relation) => ({
        ...relation,
        between: relation.between.map((entry) => displayNameByKey[entry] || entry) as [string, string],
    }))

    return {
        payload: actPayloadFromResolvedParticipants({
            urn,
            description: options.description?.trim() || act.description || act.name,
            tags: filterTags(options.tags),
            actRules: act.actRules,
            participants,
            relations,
        }),
        providedAssets: Array.from(collector.values()),
    }
}
