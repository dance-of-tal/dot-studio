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
            ...(asset.mcpConfig ? { mcp_config: asset.mcpConfig } : {}),
        }
    }

    if (asset.kind === 'act') {
        return {
            description: asset.description || asset.name,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            actRules: Array.isArray(asset.actRules) ? asset.actRules : [],
            participants: Array.isArray(asset.participants) ? asset.participants : [],
            relations: Array.isArray(asset.relations) ? asset.relations : [],
        }
    }

    throw new Error(`Unsupported asset kind '${asset.kind}' for authoring action.`)
}
