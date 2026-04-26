// Model scoring, classification, and grouping for the Asset Library

import type { ModelProviderFilter } from './asset-library-utils'
import { buildModelHaystack } from './asset-library-search'
import {
    buildRuntimeModelProviderGroups,
    modelProviderFilterForProvider,
    readProviderIdFromModelFilter,
} from '../../lib/runtime-models'

export const MAX_MODELS_PER_PROVIDER = 8

type ModelLike = {
    provider?: string
    providerName?: string
    name?: string
    id?: string
    connected?: boolean
    context?: number
    toolCall?: boolean
    reasoning?: boolean
    attachment?: boolean
}

export function classifyModelProvider(model: ModelLike): Exclude<ModelProviderFilter, 'all'> {
    return modelProviderFilterForProvider(model.provider || 'unknown') as Exclude<ModelProviderFilter, 'all'>
}

export function labelForModelProviderFilter(filter: Exclude<ModelProviderFilter, 'all'>) {
    const providerId = readProviderIdFromModelFilter(filter) || 'unknown'
    return providerId
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

export function scoreModel(model: ModelLike): number {
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

    const gptVersion = text.match(/\bgpt[- ]?(\d+)(?:[.-](\d+))?/)
    if (gptVersion) {
        score += Number(gptVersion[1]) * 10 + Number(gptVersion[2] || 0)
    }

    return score + Math.min(Math.round((model.context || 0) / 10000), 20)
}

export function groupModels<T extends ModelLike>(
    models: T[],
    queryText: string,
    modelProviderFilter: ModelProviderFilter,
) {
    return buildRuntimeModelProviderGroups(models, {
        query: queryText,
        connectedOnly: true,
        providerFilter: modelProviderFilter,
        buildSearchText: buildModelHaystack,
        compareModels: (left, right) => {
                const scoreDiff = scoreModel(right) - scoreModel(left)
                if (scoreDiff !== 0) return scoreDiff
                return String(left.name || left.id).localeCompare(String(right.name || right.id))
        },
    }).map((group) => ({
        key: group.providerId,
        label: group.providerName || labelForModelProviderFilter(group.filterKey as Exclude<ModelProviderFilter, 'all'>),
        connected: group.connected,
        items: group.models,
    }))
}
