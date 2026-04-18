import type {
    ActParticipantV1,
    ActRelationV1,
    DotAssetKind,
    ModelConfigV1,
} from './dot-types.js'

export type AssetSource = 'global' | 'stage' | 'registry' | 'draft'

export type InstalledAssetKind = DotAssetKind

export type GitHubDanceSyncState =
    | 'up_to_date'
    | 'update_available'
    | 'upstream_missing'
    | 'repo_drift'
    | 'legacy_unverifiable'
    | 'check_failed'

export type GitHubDanceRepoDriftItem = {
    name: string
    urn: string
    repoRootSkillPath: string
}

export type GitHubDanceRepoDrift = {
    newSkills: GitHubDanceRepoDriftItem[]
    missingInstalledUrns: string[]
}

export type GitHubDanceSyncStatus = {
    state: GitHubDanceSyncState
    checkedAt?: string
    message?: string
    canUpdate?: boolean
    currentHash?: string
    remoteHash?: string
    repoDrift?: GitHubDanceRepoDrift
}

export type GitHubDanceSourceInfo = {
    source: 'github'
    sourceUrl: string
    owner?: string
    repo?: string
    ref?: string
    sourceSubpath?: string
    repoRootSkillPath?: string
    skillFolderHash?: string
    installedAt?: string
    updatedAt?: string
    legacy?: boolean
    verifiable?: boolean
    sync?: GitHubDanceSyncStatus
}

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
    github?: GitHubDanceSourceInfo
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
