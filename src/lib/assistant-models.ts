import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'

export type AssistantAvailableModelSummary = {
    provider: string
    providerName: string
    modelId: string
    name: string
}

export function toAssistantAvailableModels(
    models: RuntimeModelCatalogEntry[] | null | undefined,
): AssistantAvailableModelSummary[] {
    return (models ?? [])
        .filter((model) => model.connected)
        .map((model) => ({
            provider: model.provider,
            providerName: model.providerName,
            modelId: model.id,
            name: model.name || model.id,
        }))
}
