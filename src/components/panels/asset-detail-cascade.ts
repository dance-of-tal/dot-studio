import type { AssetSource } from '../../../shared/asset-contracts'
import type { AssetPanelAsset, LibraryAsset } from './asset-panel-types'
import { displayUrn } from './asset-library-utils'

type InstalledCascadeKind = 'tal' | 'dance' | 'performer' | 'act'

type SubscriptionRecord = {
    messagesFrom?: unknown
    messageTags?: unknown
    callboardKeys?: unknown
    eventTypes?: unknown
}

type DraftPerformerContent = {
    talRef?: { kind?: string; urn?: string; draftId?: string } | null
    danceRefs?: Array<{ kind?: string; urn?: string; draftId?: string }>
}

type DraftActParticipant = {
    performerRef?: { kind?: string; urn?: string; draftId?: string } | null
    subscriptions?: SubscriptionRecord
}

type DraftActContent = {
    participants?: Record<string, DraftActParticipant>
    relations?: Array<Record<string, unknown>>
    actRules?: unknown
}

export type CascadeReference = {
    kind: InstalledCascadeKind
    label: string
    stub: LibraryAsset | null
}

export type CascadeParticipant = {
    key: string
    performer: CascadeReference
    subscriptions: string[]
}

export type CascadeRelation = {
    name: string
    direction: 'both' | 'one-way'
    between: [string, string]
    description: string
}

function isInstalledCascadeKind(value: unknown): value is InstalledCascadeKind {
    return value === 'tal' || value === 'dance' || value === 'performer' || value === 'act'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function asStringArray(value: unknown) {
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function nestedAssetSource(source?: AssetSource): AssetSource | undefined {
    if (source === 'stage' || source === 'global' || source === 'registry') return source
    return undefined
}

export function buildCascadeStubFromUrn(urn: string, source?: AssetSource): LibraryAsset | null {
    const [kind, author, segment3, segment4] = urn.split('/')
    if (!isInstalledCascadeKind(kind) || !author) return null
    const name = segment4 || segment3
    if (!name) return null
    const resolvedSource = nestedAssetSource(source)
    if (!resolvedSource) return null
    return {
        kind,
        urn,
        name,
        slug: name,
        author,
        source: resolvedSource,
    } as LibraryAsset
}

export function extractInlineAssetContent(asset: AssetPanelAsset | LibraryAsset | null) {
    if (!asset) return null
    if (typeof asset.body === 'string' && asset.body.trim()) return asset.body
    if (typeof asset.instructions === 'string' && asset.instructions.trim()) return asset.instructions
    if (typeof asset.content === 'string' && asset.content.trim()) return asset.content
    return null
}

export function summarizeMarkdown(input: string | null | undefined, limit = 180) {
    if (!input) return null
    const normalized = input
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[>*_~|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (!normalized) return null
    return normalized.length > limit
        ? `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
        : normalized
}

function performerDraftContent(asset: AssetPanelAsset | LibraryAsset): DraftPerformerContent | null {
    if (asset.kind !== 'performer' || !isRecord(asset.draftContent)) return null
    return asset.draftContent as DraftPerformerContent
}

function actDraftContent(asset: AssetPanelAsset | LibraryAsset): DraftActContent | null {
    if (asset.kind !== 'act' || !isRecord(asset.draftContent)) return null
    return asset.draftContent as DraftActContent
}

function refLabel(kind: InstalledCascadeKind, ref: { kind?: string; urn?: string; draftId?: string } | null | undefined) {
    if (!ref) return kind
    if (typeof ref.urn === 'string' && ref.urn.trim()) return displayUrn(ref.urn)
    if (typeof ref.draftId === 'string' && ref.draftId.trim()) return `${kind} draft`
    return kind
}

export function getPerformerCascadeReferences(asset: AssetPanelAsset | LibraryAsset): CascadeReference[] {
    if (asset.kind !== 'performer') return []

    const references: CascadeReference[] = []

    if (typeof asset.talUrn === 'string' && asset.talUrn.trim()) {
        references.push({
            kind: 'tal',
            label: displayUrn(asset.talUrn),
            stub: buildCascadeStubFromUrn(asset.talUrn, asset.source),
        })
    }

    if (Array.isArray(asset.danceUrns)) {
        asset.danceUrns
            .filter((urn): urn is string => typeof urn === 'string' && urn.trim().length > 0)
            .forEach((danceUrn) => {
                references.push({
                    kind: 'dance',
                    label: displayUrn(danceUrn),
                    stub: buildCascadeStubFromUrn(danceUrn, asset.source),
                })
            })
    }

    if (references.length > 0) return references

    const draft = performerDraftContent(asset)
    if (!draft) return references

    if (draft.talRef) {
        references.push({
            kind: 'tal',
            label: refLabel('tal', draft.talRef),
            stub: null,
        })
    }

    if (Array.isArray(draft.danceRefs)) {
        draft.danceRefs.forEach((danceRef) => {
            references.push({
                kind: 'dance',
                label: refLabel('dance', danceRef),
                stub: null,
            })
        })
    }

    return references
}

export function getPerformerSummary(asset: AssetPanelAsset | LibraryAsset) {
    if (asset.kind !== 'performer') return null
    const parts: string[] = []
    if (asset.talUrn) parts.push('Tal linked')
    if (Array.isArray(asset.danceUrns) && asset.danceUrns.length > 0) {
        parts.push(`${asset.danceUrns.length} dance${asset.danceUrns.length > 1 ? 's' : ''}`)
    }
    if (asset.model?.provider && asset.model?.modelId) {
        parts.push(`${asset.model.provider}/${asset.model.modelId}`)
    }
    return parts.length > 0 ? parts.join(' · ') : null
}

function formatSubscriptionLine(label: string, values: string[]) {
    return values.length > 0 ? `${label}: ${values.join(', ')}` : null
}

function subscriptionLines(subscriptions: SubscriptionRecord | undefined) {
    if (!subscriptions) return []
    return [
        formatSubscriptionLine('from', asStringArray(subscriptions.messagesFrom)),
        formatSubscriptionLine('tags', asStringArray(subscriptions.messageTags)),
        formatSubscriptionLine('board', asStringArray(subscriptions.callboardKeys)),
        formatSubscriptionLine('events', asStringArray(subscriptions.eventTypes)),
    ].filter((entry): entry is string => !!entry)
}

export function getActCascadeParticipants(asset: AssetPanelAsset | LibraryAsset): CascadeParticipant[] {
    if (asset.kind !== 'act') return []

    if (Array.isArray(asset.participants)) {
        return asset.participants
            .map((participant, index) => {
                const entry: Record<string, unknown> = isRecord(participant) ? participant : {}
                const performerUrn = typeof entry.performer === 'string' ? entry.performer : ''
                const key = typeof entry.key === 'string' && entry.key.trim() ? entry.key : `participant-${index + 1}`
                return {
                    key,
                    performer: {
                        kind: 'performer' as const,
                        label: performerUrn ? displayUrn(performerUrn) : 'performer',
                        stub: performerUrn ? buildCascadeStubFromUrn(performerUrn, asset.source) : null,
                    },
                    subscriptions: subscriptionLines(entry.subscriptions as SubscriptionRecord | undefined),
                }
            })
    }

    const draft = actDraftContent(asset)
    if (!draft || !isRecord(draft.participants)) return []

    return Object.entries(draft.participants).map(([key, participant]) => {
        const performerRef = isRecord(participant) ? participant.performerRef : null
        return {
            key,
            performer: {
                kind: 'performer' as const,
                label: refLabel('performer', performerRef),
                stub: null,
            },
            subscriptions: subscriptionLines(isRecord(participant) ? participant.subscriptions as SubscriptionRecord | undefined : undefined),
        }
    })
}

export function getActCascadeRelations(asset: AssetPanelAsset | LibraryAsset): CascadeRelation[] {
    if (asset.kind !== 'act') return []

    const rawRelations = Array.isArray(asset.relations)
        ? asset.relations
        : Array.isArray(actDraftContent(asset)?.relations)
            ? actDraftContent(asset)?.relations || []
            : []

    return rawRelations.map((relation, index) => {
        const entry = isRecord(relation) ? relation : {}
        const between = Array.isArray(entry.between) && entry.between.length === 2
            ? [
                typeof entry.between[0] === 'string' ? entry.between[0] : `participant-${index + 1}`,
                typeof entry.between[1] === 'string' ? entry.between[1] : `participant-${index + 2}`,
            ] as [string, string]
            : [`participant-${index + 1}`, `participant-${index + 2}`] as [string, string]

        return {
            name: typeof entry.name === 'string' && entry.name.trim() ? entry.name : `Relation ${index + 1}`,
            direction: entry.direction === 'one-way' ? 'one-way' : 'both',
            between,
            description: typeof entry.description === 'string' ? entry.description : '',
        }
    })
}

export function getActRules(asset: AssetPanelAsset | LibraryAsset) {
    if (Array.isArray(asset.actRules)) {
        return asset.actRules.filter((rule): rule is string => typeof rule === 'string' && rule.trim().length > 0)
    }
    const draft = actDraftContent(asset)
    if (Array.isArray(draft?.actRules)) {
        return draft.actRules.filter((rule): rule is string => typeof rule === 'string' && rule.trim().length > 0)
    }
    return []
}
