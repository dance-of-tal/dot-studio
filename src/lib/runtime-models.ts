export const ALL_MODEL_PROVIDER_FILTER = 'all'

export type ModelProviderFilter = typeof ALL_MODEL_PROVIDER_FILTER | `provider:${string}`

export type RuntimeModelLike = {
    provider?: string
    providerName?: string
    id?: string
    name?: string
    connected?: boolean
}

export type RuntimeModelProviderGroup<T extends RuntimeModelLike> = {
    providerId: string
    providerName: string
    connected: boolean
    filterKey: ModelProviderFilter
    models: T[]
}

const PROVIDER_PRIORITY_HINTS = [
    'opencode',
    'anthropic',
    'openai',
    'google',
    'gemini',
    'xai',
    'grok',
    'github-copilot',
    'openrouter',
    'amazon-bedrock',
    'azure',
]

function normalizeProviderText(value: string | null | undefined) {
    return value?.trim().toLowerCase() || ''
}

function buildProviderMatchKey(providerId: string, providerName: string) {
    return `${normalizeProviderText(providerId)} ${normalizeProviderText(providerName)}`.trim()
}

function providerRank(providerId: string, providerName: string) {
    const key = buildProviderMatchKey(providerId, providerName)
    const index = PROVIDER_PRIORITY_HINTS.findIndex((hint) => key === hint || key.includes(hint))
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function defaultCompareModels<T extends RuntimeModelLike>(left: T, right: T) {
    const leftName = left.name || left.id || ''
    const rightName = right.name || right.id || ''
    return leftName.localeCompare(rightName)
}

export function buildRuntimeModelSearchText(model: RuntimeModelLike) {
    return [
        model.name,
        model.id,
        model.providerName,
        model.provider,
    ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ')
        .toLowerCase()
}

export function modelProviderFilterForProvider(providerId: string): ModelProviderFilter {
    return `provider:${providerId}`
}

export function readProviderIdFromModelFilter(filter: ModelProviderFilter): string | null {
    if (filter === ALL_MODEL_PROVIDER_FILTER) {
        return null
    }

    return filter.slice('provider:'.length) || null
}

export function matchesModelProviderFilter(
    model: Pick<RuntimeModelLike, 'provider'>,
    filter: ModelProviderFilter,
) {
    const providerId = readProviderIdFromModelFilter(filter)
    return !providerId || model.provider === providerId
}

export function compareRuntimeModelProviders(
    left: Pick<RuntimeModelProviderGroup<RuntimeModelLike>, 'providerId' | 'providerName' | 'connected'>,
    right: Pick<RuntimeModelProviderGroup<RuntimeModelLike>, 'providerId' | 'providerName' | 'connected'>,
) {
    if (left.connected !== right.connected) {
        return Number(right.connected) - Number(left.connected)
    }

    const rankDiff = providerRank(left.providerId, left.providerName) - providerRank(right.providerId, right.providerName)
    if (rankDiff !== 0) {
        return rankDiff
    }

    return left.providerName.localeCompare(right.providerName)
}

export function filterRuntimeModels<T extends RuntimeModelLike>(
    models: readonly T[],
    options?: {
        query?: string
        connectedOnly?: boolean
        providerFilter?: ModelProviderFilter
        buildSearchText?: (model: T) => string
    },
) {
    const query = options?.query?.trim().toLowerCase() || ''
    const buildSearchText = options?.buildSearchText || buildRuntimeModelSearchText
    const providerFilter = options?.providerFilter || ALL_MODEL_PROVIDER_FILTER

    return models.filter((model) => {
        if (options?.connectedOnly && !model.connected) {
            return false
        }
        if (!matchesModelProviderFilter(model, providerFilter)) {
            return false
        }
        if (!query) {
            return true
        }
        return buildSearchText(model).includes(query)
    })
}

export function buildRuntimeModelProviderGroups<T extends RuntimeModelLike>(
    models: readonly T[],
    options?: {
        query?: string
        connectedOnly?: boolean
        providerFilter?: ModelProviderFilter
        buildSearchText?: (model: T) => string
        compareModels?: (left: T, right: T) => number
    },
): RuntimeModelProviderGroup<T>[] {
    const filtered = filterRuntimeModels(models, options)
    const compareModels = options?.compareModels || defaultCompareModels<T>
    const groups = new Map<string, RuntimeModelProviderGroup<T>>()

    for (const model of filtered) {
        const providerId = model.provider || 'unknown'
        const providerName = model.providerName || providerId
        const existing = groups.get(providerId)
        if (existing) {
            existing.models.push(model)
            existing.connected = existing.connected || !!model.connected
            continue
        }
        groups.set(providerId, {
            providerId,
            providerName,
            connected: !!model.connected,
            filterKey: modelProviderFilterForProvider(providerId),
            models: [model],
        })
    }

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            models: [...group.models].sort(compareModels),
        }))
        .sort(compareRuntimeModelProviders)
}

export function buildRuntimeModelProviderTabs<T extends RuntimeModelLike>(
    models: readonly T[],
    options?: {
        connectedOnly?: boolean
    },
) {
    const groups = buildRuntimeModelProviderGroups(models, {
        connectedOnly: options?.connectedOnly,
    })

    return [
        { key: ALL_MODEL_PROVIDER_FILTER as ModelProviderFilter, label: 'All' },
        ...groups.map((group) => ({
            key: group.filterKey,
            label: group.providerName,
        })),
    ]
}
