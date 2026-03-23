// Model scoring, classification, and grouping for the Asset Library

import type { ModelProviderFilter } from './asset-library-utils'
import { buildModelHaystack } from './asset-library-search'

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

    return score + Math.min(Math.round((model.context || 0) / 10000), 20)
}

export function groupModels<T extends ModelLike>(
    models: T[],
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
        items: T[]
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
