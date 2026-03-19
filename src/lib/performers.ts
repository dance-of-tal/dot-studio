import type {
    AssetRef,
    DanceDeliveryMode,
    DraftAsset,
    ExecutionMode,
    ModelConfig,
    PerformerNode,
    PerformerScope,
} from '../types'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config'
export {
    assetCardFromUrn,
    assetRefKey,
    assetRefKeys,
    buildActAssetPayload,
    buildAssetCardMap,
    buildAutoMcpBindingMap,
    buildMcpServerMap,
    buildPerformerAssetPayload,
    isSameAssetRef,
    normalizePerformerAssetInput,
    performerMcpConfigForAsset,
    registryAssetRef,
    registryAssetRefs,
    registryUrnFromRef,
    registryUrnsFromRefs,
    resolveMappedMcpServerNames,
    resolvePerformerPresentation,
    sanitizeMcpBindingMap,
    slugifyAssetName,
    unresolvedDeclaredMcpServerNames,
} from './performers-publish'
import {
    normalizePerformerAssetInput,
    resolveMappedMcpServerNames,
    sanitizeMcpBindingMap,
    assetRefKey,
    assetRefKeys,
} from './performers-publish'

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
        ? draft.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        : []
}

export function modelConfigToAssetValue(model: ModelConfig | null | undefined): string | undefined {
    if (!model?.provider || !model?.modelId) {
        return undefined
    }
    return `${model.provider}/${model.modelId}`
}

export function resolvePerformerAgentId(
    performer: Pick<PerformerNode, 'agentId' | 'planMode'>,
): string {
    return performer.agentId || (performer.planMode ? 'plan' : 'build')
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
        declaredMcpServerNames: extractMcpServerNamesFromConfig(performer.declaredMcpConfig),
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
    return {
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
        mcpServerNames: Array.from(new Set(input.mcpServerNames || [])),
        mcpBindingMap: sanitizeMcpBindingMap(input.mcpBindingMap),
        declaredMcpConfig: input.declaredMcpConfig || null,
        danceDeliveryMode: input.danceDeliveryMode || 'auto',
        executionMode: input.executionMode || 'direct',
        ...(input.activeSessionId ? { activeSessionId: input.activeSessionId } : {}),
        ...(input.planMode ? { planMode: input.planMode } : {}),
        ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
    }
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
