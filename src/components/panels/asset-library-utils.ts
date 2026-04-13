// Pure utility functions and types extracted from AssetLibrary.tsx
// This file serves as a barrel re-export for the split modules.

import { assetUrnDisplayName } from '../../lib/asset-urn'
import type { McpServer } from '../../types'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { AssetPanelAsset, LibraryAsset, McpPanelAsset, ModelPanelAsset } from './asset-panel-types'
export {
    ALL_MODEL_PROVIDER_FILTER,
    type ModelProviderFilter,
    modelProviderFilterForProvider,
} from '../../lib/runtime-models'

export type InstalledKind = 'performer' | 'tal' | 'dance' | 'act'
export type RuntimeKind = 'models' | 'mcps'
export type AssetScope = 'local' | 'registry'
export type SourceFilter = 'all' | 'global' | 'stage' | 'draft'
export type LocalSection = 'installed' | 'runtime'
export type RegistryKind = 'all' | InstalledKind

export const INSTALLED_KIND_ORDER: InstalledKind[] = ['performer', 'tal', 'dance', 'act']

export function displayUrn(urn: string) {
    return assetUrnDisplayName(urn)
}

export function normalizeAuthor(author?: string) {
    if (!author) return ''
    return author.startsWith('@') ? author : `@${author}`
}

export function isInstalledAssetKind(kind: string | null | undefined): kind is InstalledKind {
    return kind === 'tal' || kind === 'dance' || kind === 'performer' || kind === 'act'
}

type AssetUrnInput = {
    urn?: string
    kind?: string
    name?: string
    author?: string
    slug?: string
} | null | undefined

type AssetSelectionKeyInput = {
    urn?: string
    kind?: string
    name?: string
    author?: string
    slug?: string
    provider?: string
    id?: string
    modelId?: string
} | null | undefined

export function getAssetUrn(asset: AssetUrnInput): string | null {
    if (!asset) return null
    if (typeof asset.urn === 'string' && asset.urn.length > 0) {
        return asset.urn
    }
    if (!isInstalledAssetKind(asset.kind) || !asset.name || !asset.author) {
        return null
    }
    return `${asset.kind}/${normalizeAuthor(asset.author)}/${asset.slug || asset.name}`
}

export function getAssetSelectionKey(asset: AssetSelectionKeyInput): string {
    if (!asset) return ''
    const urn = getAssetUrn(asset)
    if (urn) return urn
    if (asset.kind === 'model') {
        return `model:${asset.provider}:${asset.id || asset.modelId || asset.name}`
    }
    if (asset.kind === 'mcp') {
        return `mcp:${asset.name}`
    }
    return `${asset.kind}:${asset.name}:${asset.author || ''}`
}

export function resolveSelectedAssetSnapshot(
    selectedAsset: AssetPanelAsset | null,
    options: {
        installedAssets?: LibraryAsset[]
        registryAssets?: LibraryAsset[]
        models?: RuntimeModelCatalogEntry[]
        mcps?: McpServer[]
    },
): AssetPanelAsset | null {
    if (!selectedAsset) return null

    const selectedKey = getAssetSelectionKey(selectedAsset)
    if (!selectedKey) return selectedAsset

    const installedMatch = (options.installedAssets || []).find((asset) => getAssetSelectionKey(asset) === selectedKey)
    if (installedMatch) {
        return installedMatch
    }

    const registryMatch = (options.registryAssets || []).find((asset) => getAssetSelectionKey(asset) === selectedKey)
    if (registryMatch) {
        return registryMatch
    }

    const modelMatch = (options.models || []).find((model) => (
        getAssetSelectionKey({ kind: 'model', ...model }) === selectedKey
    ))
    if (modelMatch) {
        return {
            ...modelMatch,
            kind: 'model',
            name: modelMatch.name || modelMatch.id,
        } satisfies ModelPanelAsset
    }

    const mcpMatch = (options.mcps || []).find((mcp) => (
        getAssetSelectionKey({ kind: 'mcp', ...mcp }) === selectedKey
    ))
    if (mcpMatch) {
        return {
            ...mcpMatch,
            kind: 'mcp',
        } satisfies McpPanelAsset
    }

    return selectedAsset
}

// Re-export from split modules
export {
    buildSearchHaystack,
    buildModelHaystack,
    buildMcpHaystack,
    filterInstalledAssets,
    buildRegistryGroups,
    labelForInstalledKind,
    placeholderForLocalSection,
    authoringNoteForInstalledKind,
} from './asset-library-search'

export {
    buildInstalledAssetDragPayload,
    buildModelDragPayload,
    buildMcpDragPayload,
} from './asset-library-drag'

export {
    MAX_MODELS_PER_PROVIDER,
    classifyModelProvider,
    labelForModelProviderFilter,
    scoreModel,
    groupModels,
} from './asset-library-models'

export {
    buildDraftAssetCards,
    buildAuthoringPayloadFromAsset,
} from './asset-library-authoring'
