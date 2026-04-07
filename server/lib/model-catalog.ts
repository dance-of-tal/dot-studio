import { getOpencode } from './opencode.js'
import {
    normalizeRuntimeVariants,
    type RuntimeModelCatalogEntry,
} from '../../shared/model-variants.js'
import type { ProviderSummary } from '../../shared/provider-auth.js'

type ProviderModelRecord = Record<string, unknown>

type ProviderListEntry = {
    id?: string
    name?: string
    source?: string
    env?: unknown[]
    models?: Record<string, ProviderModelRecord>
    capabilities?: Record<string, unknown>
    modalities?: {
        input?: unknown[]
        output?: unknown[]
    }
} & ProviderModelRecord

type ProviderListData = {
    all?: ProviderListEntry[]
    connected?: string[]
    default?: Record<string, string>
}

type ProviderSnapshot = {
    id: string
    name: string
    source: string
    env: string[]
    connected: boolean
    defaultModel: string | null
    models: ProviderModelRecord[]
    hasPaidModels: boolean
}

function responseData<T>(response: unknown): T | undefined {
    if (!response || typeof response !== 'object' || !('data' in response)) {
        return undefined
    }
    return (response as { data?: T }).data
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function readStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function readProviderModels(value: unknown): ProviderModelRecord[] {
    if (!value || typeof value !== 'object') {
        return []
    }
    return Object.values(value as Record<string, ProviderModelRecord>)
}

function hasPositiveInputCost(model: ProviderModelRecord) {
    const cost = asRecord(asRecord(model).cost)
    return typeof cost.input === 'number' && cost.input > 0
}

function normalizeProviderSnapshot(
    provider: ProviderListEntry,
    connectedProviderIds: ReadonlySet<string>,
    defaultModels: Readonly<Record<string, string>>,
): ProviderSnapshot | null {
    const id = typeof provider.id === 'string' ? provider.id : ''
    if (!id) {
        return null
    }

    const models = readProviderModels(provider.models)

    return {
        id,
        name: typeof provider.name === 'string' ? provider.name : id,
        source: typeof provider.source === 'string' ? provider.source : 'builtin',
        env: readStringArray(provider.env),
        connected: connectedProviderIds.has(id),
        defaultModel: defaultModels[id] || null,
        models,
        hasPaidModels: models.some(hasPositiveInputCost),
    }
}

function buildProviderSnapshots(data: ProviderListData | undefined): ProviderSnapshot[] {
    if (!data?.all || !Array.isArray(data.all)) {
        return []
    }

    const connectedProviderIds = new Set(readStringArray(data.connected))
    const defaultModels = data.default && typeof data.default === 'object' ? data.default : {}

    return data.all
        .map((provider) => normalizeProviderSnapshot(provider, connectedProviderIds, defaultModels))
        .filter((provider): provider is ProviderSnapshot => Boolean(provider))
}

function readCapabilityFlag(model: ProviderModelRecord, ...keys: string[]) {
    const capabilityRecord = asRecord(model.capabilities)

    for (const key of keys) {
        if (typeof capabilityRecord[key] === 'boolean') {
            return capabilityRecord[key] as boolean
        }
        if (typeof model[key] === 'boolean') {
            return model[key] as boolean
        }
    }

    return false
}

function readModalities(model: ProviderModelRecord) {
    const capabilityRecord = asRecord(model.capabilities)
    const modalityRecord = asRecord(model.modalities)

    const input = Array.isArray(capabilityRecord.input)
        ? capabilityRecord.input.filter((value): value is string => typeof value === 'string')
        : Array.isArray(modalityRecord.input)
            ? modalityRecord.input.filter((value: unknown): value is string => typeof value === 'string')
            : ['text']
    const output = Array.isArray(capabilityRecord.output)
        ? capabilityRecord.output.filter((value): value is string => typeof value === 'string')
        : Array.isArray(modalityRecord.output)
            ? modalityRecord.output.filter((value: unknown): value is string => typeof value === 'string')
            : ['text']

    return { input, output }
}
// ── Cached provider.list() ──────────────────────────────
// Both /api/providers and /api/models need the same raw data from
// oc.provider.list().  We cache for a short window to avoid duplicate
// round trips when the two routes are hit close together (which is the
// common case — the client fetches both on Settings open / refresh).

const CACHE_TTL_MS = 3_000

let _cachedPromise: Promise<ProviderListData | undefined> | null = null
let _cachedCwd: string | null = null
let _cacheTs = 0

/**
 * Fetch the raw oc.provider.list() data with a short TTL cache
 * keyed on the working directory.
 */
export async function fetchProviderListData(cwd: string): Promise<ProviderListData | undefined> {
    const now = Date.now()
    if (_cachedPromise && _cachedCwd === cwd && now - _cacheTs < CACHE_TTL_MS) {
        return _cachedPromise
    }

    _cachedCwd = cwd
    _cacheTs = now
    _cachedPromise = (async () => {
        const oc = await getOpencode()
        const res = await oc.provider.list({ directory: cwd })
        return responseData<ProviderListData>(res)
    })()

    // On failure, clear the cache so the next call retries immediately.
    _cachedPromise.catch(() => {
        _cachedPromise = null
    })

    return _cachedPromise
}

/** Invalidate the cache (e.g. after auth changes). */
export function invalidateProviderListCache() {
    _cachedPromise = null
    _cachedCwd = null
    _cacheTs = 0
}

// ── Provider summary (used by /api/providers) ───────────

export async function listProviderSummaries(cwd: string): Promise<ProviderSummary[]> {
    return buildProviderSnapshots(await fetchProviderListData(cwd)).map((provider) => ({
        id: provider.id,
        name: provider.name,
        source: provider.source,
        env: provider.env,
        connected: provider.connected,
        modelCount: provider.models.length,
        defaultModel: provider.defaultModel,
        hasPaidModels: provider.hasPaidModels,
    }))
}

// ── Model catalog (used by /api/models) ─────────────────

export async function listRuntimeModels(cwd: string): Promise<RuntimeModelCatalogEntry[]> {
    const providers = buildProviderSnapshots(await fetchProviderListData(cwd))
    const models: RuntimeModelCatalogEntry[] = []
    for (const provider of providers) {
        for (const record of provider.models) {
            const id = typeof record.id === 'string' ? record.id : ''
            if (!id) {
                continue
            }

            const limitRecord = asRecord(record.limit)

            models.push({
                provider: provider.id,
                providerName: provider.name,
                id,
                name: typeof record.name === 'string' ? record.name : id,
                connected: provider.connected,
                context: Number(limitRecord.context || 0),
                output: Number(limitRecord.output || 0),
                toolCall: readCapabilityFlag(record, 'toolcall', 'toolCall', 'tool_call'),
                reasoning: readCapabilityFlag(record, 'reasoning'),
                attachment: readCapabilityFlag(record, 'attachment'),
                temperature: readCapabilityFlag(record, 'temperature'),
                modalities: readModalities(record),
                variants: normalizeRuntimeVariants(record.variants),
            })
        }
    }

    return models
}

export async function resolveRuntimeModel(
    cwd: string,
    selection: { provider: string; modelId: string } | null,
): Promise<RuntimeModelCatalogEntry | null> {
    if (!selection) {
        return null
    }
    const models = await listRuntimeModels(cwd)
    return models.find((model) => (
        model.provider === selection.provider
        && model.id === selection.modelId
    )) || null
}
