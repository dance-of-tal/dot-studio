import type {
    AssetCard,
    AssetRef,
    DraftAsset,
    McpServer,
    ModelConfig,
    PerformerNode,
} from '../types'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config'
import { assetUrnAuthor, assetUrnDisplayName, parseStudioAssetUrn } from './asset-urn'

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)))
}

export function slugifyAssetName(value: string): string {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-._]+|[-._]+$/g, '')

    if (!normalized) return 'untitled-asset'
    if (normalized.length === 1) return `${normalized}${normalized}`
    return normalized.slice(0, 100)
}

export function registryAssetRef(urn: string | null | undefined): AssetRef | null {
    if (!urn || !urn.trim()) return null
    return { kind: 'registry', urn: urn.trim() }
}

export function registryAssetRefs(urns: string[] | undefined | null): AssetRef[] {
    return (urns || [])
        .map((urn) => registryAssetRef(urn))
        .filter((ref): ref is AssetRef => ref !== null)
}

export function assetRefKey(ref: AssetRef | null | undefined): string | null {
    if (!ref) return null
    return ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
}

export function assetRefKeys(refs: AssetRef[] | undefined | null): string[] {
    return (refs || [])
        .map((ref) => assetRefKey(ref))
        .filter((key): key is string => !!key)
}

export function isSameAssetRef(left: AssetRef | null | undefined, right: AssetRef | null | undefined): boolean {
    return assetRefKey(left) === assetRefKey(right)
}

export function registryUrnFromRef(ref: AssetRef | null | undefined): string | null {
    if (!ref || ref.kind !== 'registry') return null
    return ref.urn
}

export function registryUrnsFromRefs(refs: AssetRef[] | undefined | null): string[] {
    return (refs || [])
        .map((ref) => registryUrnFromRef(ref))
        .filter((urn): urn is string => !!urn)
}

function declaredMcpServerNames(declaredMcpConfig: Record<string, unknown> | null | undefined) {
    return extractMcpServerNamesFromConfig(declaredMcpConfig)
}

function sanitizeMcpBindingMap(mcpBindingMap: Record<string, string> | null | undefined) {
    return Object.fromEntries(
        Object.entries(mcpBindingMap || {}).filter(([placeholderName, serverName]) => !!placeholderName && !!serverName),
    )
}

export function buildAutoMcpBindingMap(
    declaredMcpConfig: Record<string, unknown> | null | undefined,
    availableServerNames: string[],
) {
    const allowed = new Set(availableServerNames.filter(Boolean))
    return Object.fromEntries(
        extractMcpServerNamesFromConfig(declaredMcpConfig)
            .filter((name) => allowed.has(name))
            .map((name) => [name, name]),
    )
}

export function resolveMappedMcpServerNames(
    performer: Pick<PerformerNode, 'mcpServerNames' | 'mcpBindingMap'>,
) {
    return unique([
        ...(performer.mcpServerNames || []),
        ...Object.values(performer.mcpBindingMap || {}).filter(Boolean),
    ])
}

export function unresolvedDeclaredMcpServerNames(
    performer: Pick<PerformerNode, 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
): string[] {
    const declaredNames = declaredMcpServerNames(performer.declaredMcpConfig)
    const bindings = performer.mcpBindingMap || {}
    const selected = new Set(performer.mcpServerNames || [])
    return declaredNames.filter((name) => {
        const mapped = bindings[name]
        if (mapped && mapped.trim()) return false
        return !selected.has(name)
    })
}

export function performerMcpConfigForAsset(
    performer: Pick<PerformerNode, 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
): Record<string, unknown> | undefined {
    const serverNames = resolveMappedMcpServerNames(performer)
    if (performer.declaredMcpConfig && typeof performer.declaredMcpConfig === 'object') {
        return performer.declaredMcpConfig
    }
    if (serverNames.length === 0) return undefined
    return { servers: serverNames }
}

function modelConfigFromAssetValue(value: unknown): ModelConfig | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    if (!normalized) return null
    const slashIndex = normalized.indexOf('/')
    const colonIndex = normalized.indexOf(':')
    const separatorIndex = slashIndex > 0 ? slashIndex : colonIndex > 0 ? colonIndex : -1
    if (separatorIndex === -1) return null
    const provider = normalized.slice(0, separatorIndex).trim()
    const modelId = normalized.slice(separatorIndex + 1).trim()
    if (!provider || !modelId) return null
    return { provider, modelId }
}

function normalizeModelValue(model: ModelConfig | string | null | undefined) {
    return typeof model === 'object' && model ? model : modelConfigFromAssetValue(model)
}

export function buildPerformerAssetPayload(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'model' | 'modelVariant' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
    options: {
        name: string
        description?: string
        tags?: string[]
    },
) {
    const talUrn = registryUrnFromRef(performer.talRef)
    const danceUrns = registryUrnsFromRefs(performer.danceRefs)
    const unresolvedRefs = [
        ...(performer.talRef && !talUrn ? [performer.talRef] : []),
        ...(performer.danceRefs || []).filter((ref) => ref.kind !== 'registry'),
    ]

    if (unresolvedRefs.length > 0) {
        throw new Error('Save Tal and Dance drafts as local assets before authoring this performer asset.')
    }
    if (!talUrn && danceUrns.length === 0) {
        throw new Error('A performer asset requires at least one Tal or Dance reference.')
    }

    const mcpConfig = performerMcpConfigForAsset(performer)

    const description = options.description?.trim() || options.name.trim()
    const tags = (options.tags || []).filter((tag) => tag.trim().length > 0)

    return {
        $schema: 'https://schemas.danceoftal.com/assets/performer.v1.json' as const,
        kind: 'performer' as const,
        urn: `performer/@pending/${slugifyAssetName(options.name.trim() || 'untitled-performer')}`,
        description,
        tags,
        payload: {
            ...(talUrn ? { tal: talUrn } : {}),
            ...(danceUrns.length > 0 ? { dances: danceUrns } : {}),
            ...(performer.model ? { model: { provider: performer.model.provider, modelId: performer.model.modelId } } : {}),
            ...(performer.modelVariant ? { modelVariant: performer.modelVariant } : {}),
            ...(mcpConfig && Object.keys(mcpConfig).length > 0 ? { mcp_config: mcpConfig } : {}),
        },
    }
}

export function buildActAssetPayload(
    act: import('../types').WorkspaceAct,
    options: { description?: string; tags?: string[] } = {},
) {
    const participants = Object.entries(act.participants).map(([key, binding]) => ({
        key,
        performerRef: binding.performerRef,
        subscriptions: binding.subscriptions,
    }))

    const unresolvedParticipants = participants.filter((participant) => participant.performerRef.kind !== 'registry')
    if (unresolvedParticipants.length > 0) {
        throw new Error('Save participant performer drafts as local assets before authoring this act asset.')
    }

    const relations = act.relations.map((relation) => ({
        between: relation.between,
        direction: relation.direction,
        name: relation.name,
        description: relation.description || relation.name,
    }))

    return {
        $schema: 'https://schemas.danceoftal.com/assets/act.v1.json' as const,
        kind: 'act' as const,
        urn: `act/@pending/${slugifyAssetName(act.name || 'untitled-act')}`,
        description: options.description?.trim() || act.description || act.name,
        tags: (options.tags || []).filter((tag) => tag.trim().length > 0),
        payload: {
            ...(act.actRules && act.actRules.length > 0 ? { actRules: act.actRules } : {}),
            participants: participants.map((participant) => ({
                key: participant.key,
                performer: participant.performerRef.kind === 'registry' ? participant.performerRef.urn : '',
                ...(participant.subscriptions ? { subscriptions: participant.subscriptions } : {}),
            })),
            relations,
        },
    }
}

function parseUrn(urn: string): AssetCard {
    const parsed = parseStudioAssetUrn(urn)
    return {
        kind: (parsed?.kind || urn.split('/')[0]) as AssetCard['kind'],
        urn,
        name: assetUrnDisplayName(urn),
        author: assetUrnAuthor(urn) || '@unknown',
        description: '',
    }
}

function draftCardFromRef(ref: AssetRef, draftMap: Record<string, DraftAsset>): AssetCard | null {
    if (ref.kind !== 'draft') return null
    const draft = draftMap[ref.draftId]
    if (!draft) {
        return {
            kind: 'tal',
            urn: `draft/${ref.draftId}`,
            name: ref.draftId,
            author: '@draft',
            description: 'Missing draft asset',
        }
    }
    return {
        kind: draft.kind as AssetCard['kind'],
        urn: `draft/${draft.id}`,
        name: draft.name,
        author: '@draft',
        description: draft.description,
        source: 'stage',
    }
}

export function normalizePerformerAssetInput(asset: {
    name: string
    urn?: string | null
    talUrn?: string | null
    danceUrns?: string[]
    model?: ModelConfig | string | null
    modelVariant?: string | null
    modelPlaceholder?: ModelConfig | null
    mcpServerNames?: string[]
    mcpBindingMap?: Record<string, string>
    mcpConfig?: Record<string, unknown> | null
}) {
    const declaredMcpConfig = asset.mcpConfig && typeof asset.mcpConfig === 'object'
        ? asset.mcpConfig
        : null
    const normalizedMcpServerNames = unique(asset.mcpServerNames || extractMcpServerNamesFromConfig(declaredMcpConfig))
    const autoBindingMap = buildAutoMcpBindingMap(declaredMcpConfig, normalizedMcpServerNames)
    const directMcpServerNames = normalizedMcpServerNames.filter((name) => !(name in autoBindingMap))

    return {
        name: asset.name,
        talRef: registryAssetRef(asset.talUrn),
        danceRefs: registryAssetRefs(asset.danceUrns),
        model: normalizeModelValue(asset.model),
        modelVariant: asset.modelVariant || null,
        modelPlaceholder: asset.modelPlaceholder || null,
        mcpServerNames: directMcpServerNames,
        mcpBindingMap: {
            ...autoBindingMap,
            ...(asset.mcpBindingMap || {}),
        },
        declaredMcpConfig,
        meta: asset.urn ? { derivedFrom: asset.urn, publishBindingUrn: asset.urn } : undefined,
    }
}

export function assetCardFromUrn(urn: string | null): AssetCard | null {
    if (!urn) return null
    return parseUrn(urn)
}

export function buildAssetCardMap(assets: AssetCard[]): Record<string, AssetCard> {
    return assets.reduce<Record<string, AssetCard>>((acc, asset) => {
        acc[asset.urn] = asset
        return acc
    }, {})
}

export function buildMcpServerMap(servers: McpServer[]): Record<string, McpServer> {
    return servers.reduce<Record<string, McpServer>>((acc, server) => {
        acc[server.name] = server
        return acc
    }, {})
}

function resolveAssetCard(
    ref: AssetRef | null | undefined,
    assetMap: Record<string, AssetCard>,
    draftMap: Record<string, DraftAsset>,
): AssetCard | null {
    if (!ref) return null
    if (ref.kind === 'registry') {
        return assetMap[ref.urn] || parseUrn(ref.urn)
    }
    return draftCardFromRef(ref, draftMap)
}

export function resolvePerformerPresentation(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
    assetMap: Record<string, AssetCard>,
    mcpMap: Record<string, McpServer>,
    draftMap: Record<string, DraftAsset> = {},
) {
    const declaredMcpNames = extractMcpServerNamesFromConfig(performer.declaredMcpConfig)
    return {
        talAsset: resolveAssetCard(performer.talRef, assetMap, draftMap),
        danceAssets: (performer.danceRefs || [])
            .map((ref) => resolveAssetCard(ref, assetMap, draftMap))
            .filter((asset): asset is AssetCard => asset !== null),
        mcpServers: resolveMappedMcpServerNames(performer).map((name) => (
            mcpMap[name] || { name, status: 'unknown', tools: [], resources: [] }
        )),
        mcpPlaceholders: unresolvedDeclaredMcpServerNames(performer),
        mappedMcpPlaceholders: Object.entries(performer.mcpBindingMap || {})
            .filter(([placeholderName, serverName]) => (
                !!placeholderName
                && !!serverName
                && declaredMcpNames.includes(placeholderName)
            ))
            .map(([placeholderName, serverName]) => ({
                placeholderName,
                serverName,
                server: mcpMap[serverName] || null,
            })),
        declaredMcpServerNames: declaredMcpNames,
    }
}

export { sanitizeMcpBindingMap }
