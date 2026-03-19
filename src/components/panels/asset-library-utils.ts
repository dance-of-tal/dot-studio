// Pure utility functions and types extracted from AssetLibrary.tsx
// This file serves as a barrel re-export for the split modules.

export type InstalledKind = 'performer' | 'tal' | 'dance' | 'act'
export type RuntimeKind = 'models' | 'mcps'
export type AssetScope = 'local' | 'registry'
export type SourceFilter = 'all' | 'global' | 'stage' | 'draft'
export type LocalSection = 'installed' | 'runtime'
export type RegistryKind = 'all' | InstalledKind
export type ModelProviderFilter = 'all' | 'anthropic' | 'openai' | 'google' | 'xai' | 'other'

export const INSTALLED_KIND_ORDER: InstalledKind[] = ['performer', 'tal', 'dance', 'act']

export function displayUrn(urn: string) {
    return urn.split('/').slice(-1)[0] || urn
}

export function normalizeAuthor(author?: string) {
    if (!author) return ''
    return author.startsWith('@') ? author : `@${author}`
}

export function isInstalledAssetKind(kind: string) {
    return kind === 'tal' || kind === 'dance' || kind === 'performer' || kind === 'act'
}

export function getAssetUrn(asset: any): string | null {
    if (!asset) return null
    if (typeof asset.urn === 'string' && asset.urn.length > 0) {
        return asset.urn
    }
    if (!isInstalledAssetKind(asset.kind) || !asset.name || !asset.author) {
        return null
    }
    return `${asset.kind}/${normalizeAuthor(asset.author)}/${asset.slug || asset.name}`
}

export function getAssetSelectionKey(asset: any): string {
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
