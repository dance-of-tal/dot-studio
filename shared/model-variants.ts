export type RuntimeModelVariant = {
    id: string
    summary: string
    options: Record<string, unknown>
}

export type RuntimeModelCatalogEntry = {
    provider: string
    providerName: string
    id: string
    name: string
    connected: boolean
    context: number
    output: number
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    temperature: boolean
    modalities: {
        input: string[]
        output: string[]
    }
    variants: RuntimeModelVariant[]
}

function flattenVariantOptions(
    value: Record<string, unknown>,
    prefix = '',
    acc: Array<[string, string]> = [],
) {
    for (const [key, raw] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            flattenVariantOptions(raw as Record<string, unknown>, path, acc)
            continue
        }
        if (Array.isArray(raw)) {
            acc.push([path, raw.join(', ')])
            continue
        }
        acc.push([path, String(raw)])
    }
    return acc
}

export function summarizeVariantOptions(options: Record<string, unknown>) {
    const entries = flattenVariantOptions(options).slice(0, 4)
    if (entries.length === 0) {
        return 'Variant preset'
    }
    return entries.map(([key, value]) => `${key}=${value}`).join(' · ')
}

export function normalizeRuntimeVariants(raw: unknown): RuntimeModelVariant[] {
    if (!raw || typeof raw !== 'object') {
        return []
    }

    return Object.entries(raw as Record<string, unknown>).map(([id, options]) => {
        const normalizedOptions = options && typeof options === 'object' && !Array.isArray(options)
            ? options as Record<string, unknown>
            : {}
        return {
            id,
            options: normalizedOptions,
            summary: summarizeVariantOptions(normalizedOptions),
        }
    })
}

export function findRuntimeModel(
    models: RuntimeModelCatalogEntry[],
    provider: string | null | undefined,
    modelId: string | null | undefined,
): RuntimeModelCatalogEntry | null {
    if (!provider || !modelId) {
        return null
    }
    return models.find((model) => model.provider === provider && model.id === modelId) || null
}

export function findRuntimeModelVariant(
    models: RuntimeModelCatalogEntry[],
    provider: string | null | undefined,
    modelId: string | null | undefined,
    variantId: string | null | undefined,
): RuntimeModelVariant | null {
    if (!variantId) {
        return null
    }
    const model = findRuntimeModel(models, provider, modelId)
    return model?.variants.find((variant) => variant.id === variantId) || null
}
