// Model resolution and normalization utilities for performers

import type { ModelConfig } from '../types'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config'

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
            // Preserve the original asset recommendation even when matched
            modelPlaceholder: requested,
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
    mcpConfig?: Record<string, unknown> | null
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

export function modelConfigToAssetValue(model: ModelConfig | null | undefined): string | undefined {
    if (!model?.provider || !model?.modelId) {
        return undefined
    }
    return `${model.provider}/${model.modelId}`
}
