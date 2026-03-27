// Asset authoring and draft payload builders for the Asset Library

import type { AssetCard, DraftAsset } from '../../types'
import type { InstalledKind } from './asset-library-utils'

export function buildDraftAssetCards(
    drafts: Record<string, DraftAsset>,
    installedKind: InstalledKind,
): AssetCard[] {

    return Object.values(drafts)
        .filter((draft): draft is DraftAsset => !!draft && draft.kind === installedKind)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((draft) => ({
            kind: draft.kind,
            urn: `draft/${draft.id}`,
            draftId: draft.id,
            name: draft.name,
            author: '@draft',
            description: draft.description || draft.name,
            source: 'draft',
            tags: Array.isArray(draft.tags) ? draft.tags : [],
            content: typeof draft.content === 'string' ? draft.content : '',
            // Carry structured draft content for performer/act drag payloads
            ...(draft.kind === 'performer' || draft.kind === 'act'
                ? { draftContent: draft.content }
                : {}),
        }))
}

type AuthorableAsset = {
    kind: InstalledKind
    name: string
    description?: string
    tags?: string[]
    content?: unknown
    talUrn?: string | null
    danceUrns?: string[]
    actUrn?: string | null
    model?: unknown
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown> | null
    schema?: string
    participants?: unknown[]
    relations?: unknown[]
    actRules?: string[]
    slug?: string
}

export function buildAuthoringPayloadFromAsset(asset: AuthorableAsset) {
    if (asset.kind === 'tal' || asset.kind === 'dance') {
        return {
            description: asset.description || asset.name,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            content: typeof asset.content === 'string' ? asset.content : '',
        }
    }

    if (asset.kind === 'performer') {
        return {
            description: asset.description || asset.name,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            ...(asset.talUrn ? { tal: asset.talUrn } : {}),
            ...(Array.isArray(asset.danceUrns) && asset.danceUrns.length > 0
                ? { dances: asset.danceUrns }
                : {}),
            ...(asset.model ? { model: asset.model } : {}),
            ...(asset.modelVariant ? { modelVariant: asset.modelVariant } : {}),
            ...(asset.mcpConfig ? { mcp_config: asset.mcpConfig } : {}),
        }
    }

    if (asset.kind === 'act') {
        // CONTRACT BOUNDARY: Convert workspace/draft Act data to canonical shape.
        // Workspace participants are Record<key, {performerRef, subscriptions, position}>
        // Canonical participants are Array<{key, performer: URN, subscriptions?}>
        // Relations may carry workspace `id` which is forbidden in canonical assets.
        const rawParticipants = Array.isArray(asset.participants)
            ? asset.participants
            : []
        const canonicalParticipants = rawParticipants.map((p) => {
            const entry = p as Record<string, unknown>
            // Already canonical (has key + performer string)
            if (typeof entry.key === 'string' && typeof entry.performer === 'string') {
                return {
                    key: entry.key,
                    performer: entry.performer,
                    ...(entry.subscriptions ? { subscriptions: entry.subscriptions } : {}),
                }
            }
            // Workspace format — should not normally reach here from installed assets,
            // but guard defensively anyway
            return entry
        })

        const rawRelations = Array.isArray(asset.relations) ? asset.relations : []
        const canonicalRelations = rawRelations.map((r) => {
            const rel = r as Record<string, unknown>
            // Strip forbidden `id` field, keep only canonical fields
            return {
                between: rel.between,
                direction: rel.direction,
                name: rel.name,
                description: rel.description,
            }
        })

        return {
            description: asset.description || asset.name,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            actRules: Array.isArray(asset.actRules) ? asset.actRules : [],
            participants: canonicalParticipants,
            relations: canonicalRelations,
        }
    }

    throw new Error(`Unsupported asset kind '${asset.kind}' for authoring action.`)
}
