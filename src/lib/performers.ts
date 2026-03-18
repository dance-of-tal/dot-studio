import type {
    AssetCard,
    AssetRef,
    DanceDeliveryMode,
    DraftAsset,
    ExecutionMode,
    McpServer,
    ModelConfig,
    PerformerNode,
    PerformerScope,
} from '../types'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config'

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

    if (!normalized) {
        return 'untitled-asset'
    }
    if (normalized.length === 1) {
        return `${normalized}${normalized}`
    }
    return normalized.slice(0, 100)
}

function hashString(value: string): string {
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        h1 = Math.imul(h1 ^ code, 2654435761)
        h2 = Math.imul(h2 ^ code, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`
}

export function modelConfigFromAssetValue(value: unknown): ModelConfig | null {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    if (!normalized) {
        return null
    }

    const slashIndex = normalized.indexOf('/')
    const colonIndex = normalized.indexOf(':')
    const separatorIndex = slashIndex > 0 ? slashIndex : colonIndex > 0 ? colonIndex : -1

    if (separatorIndex === -1) {
        return null
    }

    const provider = normalized.slice(0, separatorIndex).trim()
    const modelId = normalized.slice(separatorIndex + 1).trim()
    if (!provider || !modelId) {
        return null
    }

    return { provider, modelId }
}

export function hasModelConfig(model: ModelConfig | null | undefined): model is ModelConfig {
    return !!(model && model.provider && model.modelId)
}

export function resolveImportedModel(
    model: ModelConfig | string | null | undefined,
    runtimeModels: RuntimeModelCatalogEntry[],
): {
    model: ModelConfig | null
    modelPlaceholder: ModelConfig | null
} {
    const requested = typeof model === 'object' && model
        ? model
        : modelConfigFromAssetValue(model)

    if (!requested) {
        return {
            model: null,
            modelPlaceholder: null,
        }
    }

    const match = runtimeModels.find((entry) => (
        entry.connected
        && entry.provider === requested.provider
        && entry.id === requested.modelId
    ))

    if (match) {
        return {
            model: {
                provider: match.provider,
                modelId: match.id,
            },
            modelPlaceholder: null,
        }
    }

    return {
        model: null,
        modelPlaceholder: requested,
    }
}

export function normalizeAssetModelForStudio<T extends {
    model?: ModelConfig | string | null
    modelPlaceholder?: ModelConfig | null
}>(asset: T, runtimeModels: RuntimeModelCatalogEntry[]): T & {
    model: ModelConfig | null
    modelPlaceholder: ModelConfig | null
} {
    const resolved = resolveImportedModel(asset.model ?? null, runtimeModels)
    return {
        ...asset,
        model: resolved.model,
        modelPlaceholder: asset.modelPlaceholder || resolved.modelPlaceholder,
    }
}

export function normalizeAssetMcpForStudio<T extends {
    mcpConfig?: Record<string, any> | null
    mcpServerNames?: string[]
}>(asset: T, projectMcpServerNames: string[]): T & {
    mcpServerNames: string[]
} {
    const declaredNames = extractMcpServerNamesFromConfig(asset.mcpConfig)
    const allowed = new Set(projectMcpServerNames)
    return {
        ...asset,
        mcpServerNames: declaredNames.filter((name) => allowed.has(name)),
    }
}

export function buildAutoMcpBindingMap(
    declaredMcpConfig: Record<string, any> | null | undefined,
    availableServerNames: string[],
) {
    const allowed = new Set(availableServerNames.filter(Boolean))
    return Object.fromEntries(
        extractMcpServerNamesFromConfig(declaredMcpConfig)
            .filter((name) => allowed.has(name))
            .map((name) => [name, name]),
    )
}

function declaredMcpServerNames(declaredMcpConfig: Record<string, any> | null | undefined) {
    return extractMcpServerNamesFromConfig(declaredMcpConfig)
}

function sanitizeMcpBindingMap(mcpBindingMap: Record<string, string> | null | undefined) {
    return Object.fromEntries(
        Object.entries(mcpBindingMap || {}).filter(([placeholderName, serverName]) => !!placeholderName && !!serverName),
    )
}

function selectProjectMcpConfig(
    performer: Pick<PerformerNode, 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
    projectMcpConfig: Record<string, unknown> | undefined,
) {
    if (!projectMcpConfig) {
        return performerMcpConfigForAsset(performer)
    }

    return Object.fromEntries(
        performer.mcpServerNames
            .filter((name) => name in projectMcpConfig)
            .map((name) => [name, projectMcpConfig[name]]),
    )
}

function buildMappedMcpPlaceholders(
    performer: Pick<PerformerNode, 'mcpBindingMap' | 'declaredMcpConfig'>,
    mcpMap: Record<string, McpServer>,
) {
    return Object.entries(performer.mcpBindingMap || {})
        .filter(([placeholderName, serverName]) => (
            !!placeholderName
            && !!serverName
            && declaredMcpServerNames(performer.declaredMcpConfig).includes(placeholderName)
        ))
        .map(([placeholderName, serverName]) => ({
            placeholderName,
            serverName,
            server: mcpMap[serverName] || null,
        }))
}

function normalizeModelValue(model: ModelConfig | string | null | undefined) {
    return typeof model === 'object' && model
        ? model
        : modelConfigFromAssetValue(model)
}

export function resolveMappedMcpServerNames(
    performer: Pick<PerformerNode, 'mcpServerNames' | 'mcpBindingMap'>,
) {
    return unique([
        ...(performer.mcpServerNames || []),
        ...Object.values(performer.mcpBindingMap || {}).filter(Boolean),
    ])
}

export function resolvePerformerAgentId(
    performer: Pick<PerformerNode, 'agentId' | 'planMode'>,
): string {
    return performer.agentId || (performer.planMode ? 'plan' : 'build')
}

export function registryAssetRef(urn: string | null | undefined): AssetRef | null {
    if (!urn || !urn.trim()) {
        return null
    }
    return { kind: 'registry', urn: urn.trim() }
}

export function registryAssetRefs(urns: string[] | undefined | null): AssetRef[] {
    return (urns || [])
        .map((urn) => registryAssetRef(urn))
        .filter((ref): ref is AssetRef => ref !== null)
}

export function assetRefKey(ref: AssetRef | null | undefined): string | null {
    if (!ref) {
        return null
    }
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
    if (!ref || ref.kind !== 'registry') {
        return null
    }
    return ref.urn
}

export function draftTextContent(draft: DraftAsset | null | undefined): string {
    if (!draft) {
        return ''
    }
    if (typeof draft.content === 'string') {
        return draft.content
    }
    if (draft.content && typeof draft.content === 'object') {
        const content = draft.content as Record<string, unknown>
        if (typeof content.content === 'string') {
            return content.content
        }
        if (typeof content.body === 'string') {
            return content.body
        }
    }
    return ''
}

export function draftTags(draft: DraftAsset | null | undefined): string[] {
    return Array.isArray(draft?.tags)
        ? draft!.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        : []
}

export function registryUrnsFromRefs(refs: AssetRef[] | undefined | null): string[] {
    return (refs || [])
        .map((ref) => registryUrnFromRef(ref))
        .filter((urn): urn is string => !!urn)
}

export function unresolvedDeclaredMcpServerNames(
    performer: Pick<PerformerNode, 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
): string[] {
    const declaredNames = declaredMcpServerNames(performer.declaredMcpConfig)
    const bindings = performer.mcpBindingMap || {}
    const selected = new Set(performer.mcpServerNames || [])
    return declaredNames.filter((name) => {
        const mapped = bindings[name]
        if (mapped && mapped.trim()) {
            return false
        }
        return !selected.has(name)
    })
}

export function modelConfigToAssetValue(model: ModelConfig | null | undefined): string | undefined {
    if (!model?.provider || !model?.modelId) {
        return undefined
    }
    return `${model.provider}/${model.modelId}`
}

export function performerMcpConfigForAsset(
    performer: Pick<PerformerNode, 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
): Record<string, unknown> | undefined {
    const serverNames = resolveMappedMcpServerNames(performer)
    if (performer.declaredMcpConfig && typeof performer.declaredMcpConfig === 'object') {
        return performer.declaredMcpConfig
    }

    if (serverNames.length === 0) {
        return undefined
    }

    return {
        servers: serverNames,
    }
}

export function buildPerformerAssetPayload(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'model' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
    options: {
        name: string
        description?: string
        tags?: string[]
        projectMcpConfig?: Record<string, unknown>
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

    const unresolvedMcpNames = unresolvedDeclaredMcpServerNames(performer)
    if (unresolvedMcpNames.length > 0) {
        throw new Error('Map imported MCP placeholders to project MCP servers before publishing.')
    }

    const mcpConfig = selectProjectMcpConfig(performer, options.projectMcpConfig)
    if (resolveMappedMcpServerNames(performer).length > 0 && !mcpConfig) {
        throw new Error('Map imported MCP placeholders to project MCP servers before publishing.')
    }
    const description = options.description?.trim() || options.name.trim()
    const tags = (options.tags || []).filter((tag) => tag.trim().length > 0)

    return {
        schema: 'studio-v1' as const,
        name: options.name.trim() || 'Untitled Performer',
        description,
        tags,
        ...(talUrn ? { tal: talUrn } : {}),
        ...(danceUrns.length === 1 ? { dance: danceUrns[0] } : danceUrns.length > 1 ? { dance: danceUrns } : {}),
        ...(performer.model ? { model: { provider: performer.model.provider, modelId: performer.model.modelId } } : {}),
        ...(mcpConfig && Object.keys(mcpConfig).length > 0 ? { mcp_config: mcpConfig } : {}),
    }
}

/**
 * Build Act asset payload for registry publish (schema: studio-v1).
 * Serializes Act's performer bindings and communication contract relations.
 */
export function buildActAssetPayload(
    act: import('../types').StageAct,
    options: { description?: string; tags?: string[] } = {},
) {
    const performers = Object.entries(act.performers).map(([key, binding]) => ({
        key,
        performerRef: binding.performerRef,
        activeDanceIds: binding.activeDanceIds,
        subscriptions: binding.subscriptions,
    }))

    const relations = act.relations.map((rel) => ({
        between: rel.between,
        direction: rel.direction,
        name: rel.name,
        description: rel.description || '',
        permissions: rel.permissions,
        maxCalls: rel.maxCalls,
        timeout: rel.timeout,
    }))

    return {
        schema: 'studio-v1' as const,
        name: act.name,
        description: options.description?.trim() || act.description || act.name,
        tags: (options.tags || []).filter((t) => t.trim().length > 0),
        actRules: act.actRules,
        performers,
        relations,
    }
}

function parseUrn(urn: string): AssetCard {
    const [kind, author, name] = urn.split('/')
    return {
        kind: kind as AssetCard['kind'],
        urn,
        name,
        author,
        description: '',
    }
}

function draftCardFromRef(ref: AssetRef, draftMap: Record<string, DraftAsset>): AssetCard | null {
    if (ref.kind !== 'draft') {
        return null
    }

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
    modelPlaceholder?: ModelConfig | null
    mcpServerNames?: string[]
    mcpBindingMap?: Record<string, string>
    mcpConfig?: Record<string, any> | null
}) {
    const declaredMcpConfig = asset.mcpConfig && typeof asset.mcpConfig === 'object'
        ? asset.mcpConfig
        : null
    const normalizedMcpServerNames = unique(asset.mcpServerNames || declaredMcpServerNames(declaredMcpConfig))
    const autoBindingMap = buildAutoMcpBindingMap(declaredMcpConfig, normalizedMcpServerNames)
    const directMcpServerNames = normalizedMcpServerNames.filter((name) => !(name in autoBindingMap))

    return {
        name: asset.name,
        talRef: registryAssetRef(asset.talUrn),
        danceRefs: registryAssetRefs(asset.danceUrns),
        model: normalizeModelValue(asset.model),
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
    if (!urn) {
        return null
    }
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
    if (!ref) {
        return null
    }

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
    const declaredMcpNames = declaredMcpServerNames(performer.declaredMcpConfig)
    return {
        talAsset: resolveAssetCard(performer.talRef, assetMap, draftMap),
        danceAssets: (performer.danceRefs || [])
            .map((ref) => resolveAssetCard(ref, assetMap, draftMap))
            .filter((asset): asset is AssetCard => asset !== null),
        mcpServers: resolveMappedMcpServerNames(performer).map((name) => (
            mcpMap[name] || {
                name,
                status: 'unknown',
                tools: [],
                resources: [],
            }
        )),
        mcpPlaceholders: unresolvedDeclaredMcpServerNames(performer),
        mappedMcpPlaceholders: buildMappedMcpPlaceholders(performer, mcpMap),
        declaredMcpServerNames: declaredMcpNames,
    }
}

export function resolvePerformerRuntimeConfig(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'model' | 'modelVariant' | 'mcpServerNames' | 'mcpBindingMap' | 'danceDeliveryMode' | 'planMode' | 'agentId'>,
) {
    return {
        talRef: performer.talRef || null,
        danceRefs: performer.danceRefs || [],
        model: performer.model || null,
        modelVariant: performer.modelVariant || null,
        agentId: resolvePerformerAgentId(performer),
        mcpServerNames: resolveMappedMcpServerNames(performer),
        danceDeliveryMode: performer.danceDeliveryMode || 'auto',
        planMode: !!performer.planMode,
    }
}

export function buildPerformerConfigHash(
    performer: Pick<PerformerNode, 'talRef' | 'danceRefs' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig' | 'danceDeliveryMode' | 'planMode' | 'modelVariant' | 'agentId'> & {
        model: ModelConfig | null
    },
): string {
    const normalized = {
        talRef: assetRefKey(performer.talRef),
        danceRefs: [...assetRefKeys(performer.danceRefs)].sort(),
        mcpServerNames: [...resolveMappedMcpServerNames(performer)].sort(),
        mcpBindingMap: Object.fromEntries(
            Object.entries(performer.mcpBindingMap || {})
                .filter(([, value]) => !!value)
                .sort(([left], [right]) => left.localeCompare(right)),
        ),
        declaredMcpServerNames: declaredMcpServerNames(performer.declaredMcpConfig),
        model: performer.model ? {
            provider: performer.model.provider,
            modelId: performer.model.modelId,
        } : null,
        modelVariant: performer.modelVariant || null,
        agentId: resolvePerformerAgentId(performer),
        danceDeliveryMode: performer.danceDeliveryMode,
    }
    return `cfg_${hashString(JSON.stringify(normalized))}`
}

export function createPerformerNode(input: {
    id: string
    name: string
    x: number
    y: number
    scope?: PerformerScope
    talRef?: AssetRef | null
    danceRefs?: AssetRef[]
    model?: ModelConfig | null
    modelPlaceholder?: ModelConfig | null
    modelVariant?: string | null
    agentId?: string | null
    mcpServerNames?: string[]
    mcpBindingMap?: Record<string, string>
    declaredMcpConfig?: Record<string, any> | null
    danceDeliveryMode?: DanceDeliveryMode
    executionMode?: ExecutionMode
    planMode?: boolean
    hidden?: boolean
    activeSessionId?: string
    meta?: {
        derivedFrom?: string | null
        publishBindingUrn?: string | null
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}): PerformerNode {
    const node: PerformerNode = {
        id: input.id,
        name: input.name,
        position: { x: input.x, y: input.y },
        width: 320,
        height: 400,
        scope: input.scope || 'shared',
        model: input.model || null,
        ...(input.modelPlaceholder ? { modelPlaceholder: input.modelPlaceholder } : {}),
        ...(input.modelVariant ? { modelVariant: input.modelVariant } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        talRef: input.talRef || null,
        danceRefs: input.danceRefs || [],
        mcpServerNames: unique(input.mcpServerNames || []),
        mcpBindingMap: sanitizeMcpBindingMap(input.mcpBindingMap),
        declaredMcpConfig: input.declaredMcpConfig || null,
        danceDeliveryMode: input.danceDeliveryMode || 'auto',
        executionMode: input.executionMode || 'direct',
        ...(input.activeSessionId ? { activeSessionId: input.activeSessionId } : {}),
        ...(input.planMode ? { planMode: input.planMode } : {}),
        ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
    }
    return node
}

export function createPerformerNodeFromAsset(input: {
    id: string
    asset: {
        name: string
        urn?: string | null
        talUrn?: string | null
        danceUrns?: string[]
        model?: ModelConfig | string | null
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, any> | null
    }
    x: number
    y: number
    scope?: PerformerScope
    hidden?: boolean
}): PerformerNode {
    const normalized = normalizePerformerAssetInput(input.asset)
    return createPerformerNode({
        id: input.id,
        name: normalized.name,
        x: input.x,
        y: input.y,
        scope: input.scope,
        talRef: normalized.talRef,
        danceRefs: normalized.danceRefs,
        model: normalized.model,
        modelPlaceholder: normalized.modelPlaceholder,
        modelVariant: null,
        agentId: null,
        mcpServerNames: normalized.mcpServerNames,
        mcpBindingMap: normalized.mcpBindingMap,
        declaredMcpConfig: normalized.declaredMcpConfig,
        hidden: input.hidden,
        meta: normalized.meta,
    })
}

export function clonePerformerNode(input: {
    id: string
    source: PerformerNode
    x: number
    y: number
    scope?: PerformerScope
    hidden?: boolean
    name?: string
    carryPublishBinding?: boolean
    preserveAuthoring?: boolean
}): PerformerNode {
    const sourceUrn = input.source.meta?.publishBindingUrn
        || input.source.meta?.derivedFrom
        || null
    return createPerformerNode({
        id: input.id,
        name: input.name || input.source.name,
        x: input.x,
        y: input.y,
        scope: input.scope || input.source.scope,
        talRef: input.source.talRef,
        danceRefs: input.source.danceRefs,
        model: input.source.model,
        modelPlaceholder: input.source.modelPlaceholder || null,
        modelVariant: input.source.modelVariant || null,
        agentId: input.source.agentId || null,
        mcpServerNames: input.source.mcpServerNames,
        mcpBindingMap: input.source.mcpBindingMap,
        declaredMcpConfig: input.source.declaredMcpConfig,
        danceDeliveryMode: input.source.danceDeliveryMode,
        planMode: input.source.planMode,
        hidden: input.hidden ?? input.source.hidden,
        meta: {
            ...(sourceUrn ? { derivedFrom: sourceUrn } : {}),
            ...(input.carryPublishBinding && sourceUrn ? { publishBindingUrn: sourceUrn } : {}),
            ...(input.preserveAuthoring && input.source.meta?.authoring ? { authoring: input.source.meta.authoring } : {}),
        },
    })
}
