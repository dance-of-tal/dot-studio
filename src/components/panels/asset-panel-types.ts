import type { AssetCard, McpServer } from '../../types'
import type { AssetSource, AssetListItem } from '../../../shared/asset-contracts'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { ModelConfigV1 } from '../../../shared/dot-types'

type InstalledAssetKind = 'tal' | 'dance' | 'performer' | 'act'

type PanelAssetSharedFields = {
    urn?: string
    slug?: string
    author?: string
    source?: AssetSource
    description?: string
    desc?: string
    tags?: string[]
    content?: string
    body?: string
    instructions?: string
    talUrn?: string | null
    danceUrns?: string[]
    actUrn?: string | null
    model?: ModelConfigV1 | null
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown> | null
    declaredMcpServerNames?: string[]
    projectMcpMatches?: string[]
    projectMcpMissing?: string[]
    participantCount?: number
    participants?: Array<Record<string, unknown>>
    relations?: Array<Record<string, unknown>>
    relationCount?: number
    actRules?: string[]
    provider?: string
    providerName?: string
    id?: string
    connected?: boolean
    context?: number
    output?: number
    toolCall?: boolean
    reasoning?: boolean
    attachment?: boolean
    temperature?: boolean
    modalities?: {
        input: string[]
        output: string[]
    }
    tools?: Array<{ name: string; description?: string }>
    resources?: Array<unknown>
    status?: McpServer['status']
    enabled?: boolean
    defined?: boolean
    configType?: McpServer['configType']
    authStatus?: McpServer['authStatus']
    error?: string
    oauthConfigured?: boolean
    clientRegistrationRequired?: boolean
    draftId?: string
    draftContent?: unknown
    schema?: string
    stars?: number
    tier?: string
    updatedAt?: string
}

export type LibraryAsset = ((AssetCard & { kind: InstalledAssetKind }) | (AssetListItem & { kind: InstalledAssetKind })) & PanelAssetSharedFields

export type ModelPanelAsset = RuntimeModelCatalogEntry & PanelAssetSharedFields & {
    kind: 'model'
    name: string
}

export type McpPanelAsset = McpServer & PanelAssetSharedFields & {
    kind: 'mcp'
}

export type AssetPanelAsset = LibraryAsset | ModelPanelAsset | McpPanelAsset

export type AssetPanelAuthUser = {
    authenticated: boolean
    username: string | null
}

export type AssetPanelAction = 'save-local' | 'publish' | 'import'

export type AssetPanelHandler = (asset: AssetPanelAsset) => void | Promise<void>

export type RegistryGroup<T extends { kind: string } = LibraryAsset> = {
    kind: string
    label: string
    items: T[]
}
