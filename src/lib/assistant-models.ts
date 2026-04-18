import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'

export type AssistantAvailableModelSummary = {
    provider: string
    providerName: string
    modelId: string
    name: string
    variants?: Array<{
        id: string
        summary: string
    }>
}

type AssistantModelLike = {
    provider: string
    providerName: string
    modelId: string
    name: string
}

export function isAssistantCompatibleModel(
    model: Pick<RuntimeModelCatalogEntry, 'connected' | 'toolCall'>,
) {
    return model.connected && model.toolCall
}

function assistantModelScore(model: AssistantModelLike) {
    const haystack = `${model.provider} ${model.modelId} ${model.name}`.toLowerCase()
    let score = 0

    if (model.provider === 'openai') score += 40
    if (haystack.includes('gpt-5.4')) score += 40
    else if (haystack.includes('gpt-5.3')) score += 35
    else if (haystack.includes('gpt-5.2')) score += 30
    else if (haystack.includes('gpt-5.1')) score += 25
    else if (haystack.includes('gpt-5')) score += 20

    if (haystack.includes('codex')) score += 12
    if (haystack.includes('claude')) score += 10

    if (haystack.includes('mini')) score -= 4
    if (haystack.includes('free')) score -= 10
    if (haystack.includes('nano')) score -= 35
    if (haystack.includes('pickle')) score -= 45

    return score
}

export function sortAssistantAvailableModels<T extends AssistantModelLike>(models: T[]): T[] {
    return [...models].sort((left, right) => {
        const scoreDiff = assistantModelScore(right) - assistantModelScore(left)
        if (scoreDiff !== 0) return scoreDiff

        const providerDiff = left.providerName.localeCompare(right.providerName)
        if (providerDiff !== 0) return providerDiff

        return left.name.localeCompare(right.name)
    })
}

export function pickPreferredAssistantModel<T extends AssistantModelLike>(
    models: T[] | null | undefined,
): T | null {
    const sorted = sortAssistantAvailableModels(models ?? [])
    return sorted[0] || null
}

export function toAssistantAvailableModels(
    models: RuntimeModelCatalogEntry[] | null | undefined,
): AssistantAvailableModelSummary[] {
    const connected = (models ?? [])
        .filter(isAssistantCompatibleModel)
        .map((model) => ({
            provider: model.provider,
            providerName: model.providerName,
            modelId: model.id,
            name: model.name || model.id,
            ...((model.variants || []).length > 0
                ? {
                    variants: (model.variants || []).map((variant) => ({
                        id: variant.id,
                        summary: variant.summary,
                    })),
                }
                : {}),
        }))

    return sortAssistantAvailableModels(connected)
}
