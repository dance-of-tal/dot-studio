// Search, filter, and haystack utilities for the Asset Library

import type { InstalledKind, LocalSection, RuntimeKind, SourceFilter } from './asset-library-utils'
import type { RegistryGroup } from './asset-panel-types'

type SearchableAsset = {
    name?: string
    author?: string
    urn?: string
    description?: string
    tags?: string[]
    source?: string
}
type SearchableModel = {
    name?: string
    id?: string
    provider?: string
    providerName?: string
    toolCall?: boolean
    attachment?: boolean
}
type SearchableMcp = {
    name?: string
    status?: string
    tools?: Array<{ name: string; description?: string }>
}

export function buildSearchHaystack(asset: SearchableAsset): string {
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

export function buildModelHaystack(model: SearchableModel): string {
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

export function buildMcpHaystack(mcp: SearchableMcp): string {
    return [
        mcp.name,
        mcp.status,
        ...(Array.isArray(mcp.tools) ? mcp.tools.map((tool) => `${tool.name} ${tool.description || ''}`) : []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function filterInstalledAssets<T extends SearchableAsset>(
    assets: T[],
    sourceFilter: SourceFilter,
    queryText: string,
) {
    return assets
        .filter((asset) => sourceFilter === 'all' ? true : asset.source === sourceFilter)
        .filter((asset) => !queryText || buildSearchHaystack(asset).includes(queryText))
}

export function buildRegistryGroups<T extends { kind: InstalledKind }>(registryResults: T[]): RegistryGroup<T>[] {
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
        return 'Drag & drop onto a performer, or edit from the draft card.'
    }
    if (installedKind === 'performer') {
        return 'Drag & drop onto the canvas to create a new performer.'
    }
    return 'Drag & drop onto the canvas to create a new act.'
}
