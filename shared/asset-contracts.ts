import type {
    ActParticipantV1,
    ActRelationV1,
    DotAssetKind,
    ModelConfigV1,
} from './dot-types.js'

export type AssetSource = 'global' | 'stage' | 'registry' | 'draft'

export type InstalledAssetKind = DotAssetKind

type AssetListItemBase<K extends InstalledAssetKind> = {
    kind: K
    urn?: string
    slug?: string
    name: string
    author?: string
    source?: Exclude<AssetSource, 'draft'>
    description?: string
    tags?: string[]
    schema?: string
    content?: string
    stars?: number
    tier?: string
    updatedAt?: string
}

export type TalAssetListItem = AssetListItemBase<'tal'> & {
    content?: string
}

export type DanceAssetListItem = AssetListItemBase<'dance'> & {
    content?: string
}

export type PerformerAssetListItem = AssetListItemBase<'performer'> & {
    talUrn: string | null
    danceUrns: string[]
    model?: ModelConfigV1 | null
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown> | null
    declaredMcpServerNames?: string[]
    matchedMcpServerNames?: string[]
    missingMcpServerNames?: string[]
}

export type ActAssetListItem = AssetListItemBase<'act'> & {
    actRules?: string[]
    participantCount?: number
    relationCount?: number
    participants?: ActParticipantV1[]
    relations?: ActRelationV1[]
}

export type AssetListItem =
    | TalAssetListItem
    | DanceAssetListItem
    | PerformerAssetListItem
    | ActAssetListItem
