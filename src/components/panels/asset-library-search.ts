// Search, filter, and haystack utilities for the Asset Library

import type { AssetCard } from '../../types'
import type { InstalledKind, LocalSection, RuntimeKind, SourceFilter } from './asset-library-utils'

export function buildSearchHaystack(asset: any): string {
    return [
        asset.name,
        asset.author,
        asset.urn,
        asset.description,
        ...(Array.isArray(asset.tags) ? asset.tags : []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function buildModelHaystack(model: any): string {
    return [
        model.name,
        model.id,
        model.provider,
        model.providerName,
        model.toolCall ? 'tool-call' : '',
        model.attachment ? 'attachment' : '',
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function buildMcpHaystack(mcp: any): string {
    return [
        mcp.name,
        mcp.status,
        ...(Array.isArray(mcp.tools) ? mcp.tools.map((tool: any) => `${tool.name} ${tool.description || ''}`) : []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function filterInstalledAssets(
    assets: AssetCard[],
    sourceFilter: SourceFilter,
    queryText: string,
) {
    return assets
        .filter((asset) => sourceFilter === 'all' ? true : asset.source === sourceFilter)
        .filter((asset) => !queryText || buildSearchHaystack(asset).includes(queryText))
}

export function buildRegistryGroups(registryResults: any[]) {
    const INSTALLED_KIND_ORDER: InstalledKind[] = ['performer', 'tal', 'dance', 'act']
    return INSTALLED_KIND_ORDER
        .map((kind) => ({
            kind,
            label: labelForInstalledKind(kind),
            items: registryResults.filter((item) => item.kind === kind),
        }))
        .filter((group) => group.items.length > 0)
}

export function labelForInstalledKind(kind: InstalledKind) {
    if (kind === 'tal') return 'Tal'
    if (kind === 'dance') return 'Dance'
    if (kind === 'performer') return 'Performer'
    return 'Act'
}

export function placeholderForLocalSection(localSection: LocalSection, runtimeKind: RuntimeKind) {
    if (localSection === 'installed') {
        return 'name, urn, author, tag...'
    }

    return runtimeKind === 'models'
        ? 'model, provider, capability...'
        : 'server, tool, status...'
}

export function authoringNoteForInstalledKind(installedKind: InstalledKind) {
    if (installedKind === 'tal' || installedKind === 'dance') {
        return 'Creates a new markdown editor on the canvas.'
    }
    if (installedKind === 'performer') {
        return 'Creates a new stage performer.'
    }
    return 'Creates a new act area.'
}
