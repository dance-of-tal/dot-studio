import { api } from '../api'
import type { ModelConfig } from '../types'
import { mcpServerNamesFromConfig } from '../../shared/mcp-catalog'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import { normalizeAssetMcpForStudio, normalizeAssetModelForStudio } from './performers'

export type PerformerImportAsset = {
    model?: ModelConfig | string | null
    modelPlaceholder?: ModelConfig | null
    mcpConfig?: Record<string, unknown> | null
    mcpServerNames?: string[]
}

export type PerformerImportContext = {
    runtimeModels: RuntimeModelCatalogEntry[]
    availableMcpServerNames: string[]
}

export async function loadPerformerImportContext(): Promise<PerformerImportContext> {
    const [globalConfig, runtimeModels] = await Promise.all([
        api.config.getGlobal().catch(() => ({})),
        api.models.list().catch(() => []),
    ])

    return {
        runtimeModels,
        availableMcpServerNames: mcpServerNamesFromConfig(globalConfig),
    }
}

export function normalizeImportedPerformerAsset<T extends PerformerImportAsset>(
    asset: T,
    context: PerformerImportContext,
): T & {
    model: ModelConfig | null
    modelPlaceholder: ModelConfig | null
    mcpServerNames: string[]
} {
    return normalizeAssetMcpForStudio(
        normalizeAssetModelForStudio(asset, context.runtimeModels),
        context.availableMcpServerNames,
    )
}
