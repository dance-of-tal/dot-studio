// Pure utility functions and types extracted from AssetLibrary.tsx

import type { AssetCard, DraftAsset } from '../../types'

export type InstalledKind = 'performer' | 'tal' | 'dance' | 'act'
export type RuntimeKind = 'models' | 'mcps'
export type AssetScope = 'local' | 'registry'
export type SourceFilter = 'all' | 'global' | 'stage' | 'draft'
export type LocalSection = 'installed' | 'runtime'
export type RegistryKind = 'all' | InstalledKind
export type ModelProviderFilter = 'all' | 'anthropic' | 'openai' | 'google' | 'xai' | 'other'

export const INSTALLED_KIND_ORDER: InstalledKind[] = ['performer', 'tal', 'dance', 'act']
export const MAX_MODELS_PER_PROVIDER = 8

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

export function buildInstalledAssetDragPayload(asset: any) {
    if (asset.source === 'draft') {
        return {
            kind: asset.kind,
            urn: asset.urn,
            draftId: asset.draftId,
            source: asset.source,
            name: asset.name,
            author: asset.author,
        }
    }

    if (asset.kind === 'performer') {
        return {
            kind: 'performer',
            urn: asset.urn,
            name: asset.name,
            author: asset.author,
            talUrn: asset.talUrn || null,
            danceUrns: Array.isArray(asset.danceUrns) ? asset.danceUrns : [],
            model: asset.model || null,
            mcpConfig: asset.mcpConfig || null,
        }
    }

    return {
        kind: asset.kind,
        urn: asset.urn,
        slug: asset.slug,
        name: asset.name,
        author: asset.author,
        source: asset.source,
    }
}

export function buildModelDragPayload(model: any) {
    return {
        kind: 'model',
        provider: model.provider,
        providerName: model.providerName || model.provider,
        modelId: model.id,
        name: model.name || model.id,
        connected: !!model.connected,
    }
}

export function buildMcpDragPayload(mcp: any) {
    return {
        kind: 'mcp',
        name: mcp.name,
        status: mcp.status,
        tools: Array.isArray(mcp.tools) ? mcp.tools : [],
        resources: Array.isArray(mcp.resources) ? mcp.resources : [],
    }
}

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

export function labelForInstalledKind(kind: InstalledKind) {
    if (kind === 'tal') return 'Tal'
    if (kind === 'dance') return 'Dance'
    if (kind === 'performer') return 'Performer'
    return 'Act'
}

export function classifyModelProvider(model: any): Exclude<ModelProviderFilter, 'all'> {
    const key = `${model.provider || ''} ${model.providerName || ''}`.toLowerCase()
    if (key.includes('anthropic')) return 'anthropic'
    if (key.includes('openai')) return 'openai'
    if (key.includes('google') || key.includes('gemini')) return 'google'
    if (key.includes('xai') || key.includes('grok')) return 'xai'
    return 'other'
}

export function labelForModelProviderFilter(filter: Exclude<ModelProviderFilter, 'all'>) {
    if (filter === 'anthropic') return 'Anthropic'
    if (filter === 'openai') return 'OpenAI'
    if (filter === 'google') return 'Google'
    if (filter === 'xai') return 'xAI/Grok'
    return 'Other'
}

export function scoreModel(model: any): number {
    const text = `${model.name || ''} ${model.id || ''}`.toLowerCase()
    let score = model.connected ? 1000 : 0

    if (text.includes('sonnet')) score += 140
    if (text.includes('opus')) score += 132
    if (text.includes('haiku')) score += 110
    if (text.includes('gpt-5')) score += 145
    if (text.includes('gpt-4.1')) score += 132
    if (text.includes('o3')) score += 128
    if (text.includes('o4')) score += 120
    if (text.includes('gemini 2.5 pro') || text.includes('gemini-2.5-pro')) score += 140
    if (text.includes('gemini 2.5 flash') || text.includes('gemini-2.5-flash')) score += 128
    if (text.includes('grok 4') || text.includes('grok-4')) score += 135
    if (text.includes('grok 3') || text.includes('grok-3')) score += 120
    if (text.includes('mini')) score -= 8
    if (text.includes('preview') || text.includes('beta')) score -= 12
    if (model.toolCall) score += 8
    if (model.reasoning) score += 4

    return score + Math.min(Math.round((model.context || 0) / 10000), 20)
}

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

export function filterInstalledAssets(
    assets: AssetCard[],
    sourceFilter: SourceFilter,
    queryText: string,
) {
    return assets
        .filter((asset) => sourceFilter === 'all' ? true : asset.source === sourceFilter)
        .filter((asset) => !queryText || buildSearchHaystack(asset).includes(queryText))
}

export function groupModels(
    models: any[],
    queryText: string,
    modelProviderFilter: ModelProviderFilter,
) {
    const searched = models.filter((model) => !queryText || buildModelHaystack(model).includes(queryText))
    const availabilityFiltered = searched.filter((model) => !!model.connected)
    const providerFiltered = availabilityFiltered.filter((model) => {
        const category = classifyModelProvider(model)
        if (modelProviderFilter === 'all') return true
        return category === modelProviderFilter
    })

    const groups = new Map<string, {
        key: string
        category: Exclude<ModelProviderFilter, 'all'>
        label: string
        connected: boolean
        items: any[]
    }>()

    for (const model of providerFiltered) {
        const category = classifyModelProvider(model)
        const key = model.provider || `${category}-provider`
        const existing = groups.get(key)
        if (existing) {
            existing.items.push(model)
            existing.connected = existing.connected || !!model.connected
            continue
        }
        groups.set(key, {
            key,
            category,
            label: model.providerName || labelForModelProviderFilter(category),
            connected: !!model.connected,
            items: [model],
        })
    }

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            items: [...group.items].sort((left, right) => {
                const scoreDiff = scoreModel(right) - scoreModel(left)
                if (scoreDiff !== 0) return scoreDiff
                return String(left.name || left.id).localeCompare(String(right.name || right.id))
            }),
        }))
        .sort((left, right) => {
            const connectedDiff = Number(right.connected) - Number(left.connected)
            if (connectedDiff !== 0) return connectedDiff
            const providerSortOrder = ['anthropic', 'openai', 'google', 'xai']
            const leftPriority = providerSortOrder.indexOf(left.category)
            const rightPriority = providerSortOrder.indexOf(right.category)
            const normalizedLeft = leftPriority === -1 ? 999 : leftPriority
            const normalizedRight = rightPriority === -1 ? 999 : rightPriority
            if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight
            return left.label.localeCompare(right.label)
        })
}

export function buildRegistryGroups(registryResults: any[]) {
    return INSTALLED_KIND_ORDER
        .map((kind) => ({
            kind,
            label: labelForInstalledKind(kind),
            items: registryResults.filter((item) => item.kind === kind),
        }))
        .filter((group) => group.items.length > 0)
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
    slug?: string
}

export function buildAuthoringPayloadFromAsset(asset: AuthorableAsset) {
    if (asset.kind === 'tal' || asset.kind === 'dance') {
        return {
            name: asset.name,
            description: asset.description || asset.name,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            content: typeof asset.content === 'string' ? asset.content : '',
        }
    }

    if (asset.kind === 'performer') {
        return {
            name: asset.name,
            description: asset.description || asset.name,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            ...(asset.talUrn ? { tal: asset.talUrn } : {}),
            ...(Array.isArray(asset.danceUrns) && asset.danceUrns.length === 1
                ? { dance: asset.danceUrns[0] }
                : Array.isArray(asset.danceUrns) && asset.danceUrns.length > 1
                    ? { dance: asset.danceUrns }
                    : {}),
            ...(asset.actUrn ? { act: asset.actUrn } : {}),
            ...(asset.model ? { model: asset.model } : {}),
            ...(asset.mcpConfig ? { mcp_config: asset.mcpConfig } : {}),
        }
    }

    if (asset.kind === 'act') {
        return {
            schema: 'studio-v1' as const,
            name: asset.name,
            description: asset.description || asset.name,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            participants: Array.isArray(asset.participants) ? asset.participants : [],
            relations: Array.isArray(asset.relations) ? asset.relations : [],
        }
    }

    throw new Error(`Unsupported asset kind '${asset.kind}' for authoring action.`)
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
