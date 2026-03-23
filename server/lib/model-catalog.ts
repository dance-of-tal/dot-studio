import { getOpencode } from './opencode.js'
import { readStoredProviderAuthType } from './opencode-auth.js'
import {
    normalizeRuntimeVariants,
    type RuntimeModelCatalogEntry,
} from '../../shared/model-variants.js'

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

function responseData<T>(response: unknown): T | undefined {
    if (!response || typeof response !== 'object' || !('data' in response)) {
        return undefined
    }
    return (response as { data?: T }).data
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

const incompatibleModelsByAuthType: Record<string, Record<string, Set<string>>> = {
    openai: {
        // ChatGPT account-backed OpenAI auth rejects these at runtime today.
        oauth: new Set([
            'codex-mini-latest',
            'gpt-5.3-codex-spark',
        ]),
    },
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

function isModelVisibleForAuthType(providerId: string, modelId: string, authType: string | null) {
    if (!authType) {
        return true
    }

    const blocked = incompatibleModelsByAuthType[providerId]?.[authType]
    if (!blocked) {
        return true
    }

    return !blocked.has(modelId)
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

export interface ProviderSummary {
    id: string
    name: string
    source: string
    env: string[]
    connected: boolean
    modelCount: number
    defaultModel: string | null
}

export async function listProviderSummaries(cwd: string): Promise<ProviderSummary[]> {
    const data = await fetchProviderListData(cwd)

    if (!data?.all || !Array.isArray(data.all)) {
        return []
    }

    const connected = new Set<string>((data?.connected || []) as string[])

    return data.all.map((provider) => ({
        id: typeof provider.id === 'string' ? provider.id : '',
        name: typeof provider.name === 'string' ? provider.name : (typeof provider.id === 'string' ? provider.id : ''),
        source: typeof provider.source === 'string' ? provider.source : 'builtin',
        env: Array.isArray(provider.env) ? provider.env.filter((value): value is string => typeof value === 'string') : [],
        connected: typeof provider.id === 'string' ? connected.has(provider.id) : false,
        modelCount: provider.models ? Object.keys(provider.models).length : 0,
        defaultModel: typeof provider.id === 'string' ? data?.default?.[provider.id] || null : null,
    }))
}

// ── Model catalog (used by /api/models) ─────────────────

export async function listRuntimeModels(cwd: string): Promise<RuntimeModelCatalogEntry[]> {
    const data = await fetchProviderListData(cwd)

    if (!data?.all || !Array.isArray(data.all)) {
        return []
    }

    const connectedProviders = new Set<string>(
        Array.isArray(data.connected)
            ? data.connected.filter((value: unknown): value is string => typeof value === 'string')
            : [],
    )
    const authTypes = new Map<string, string | null>()

    const models: RuntimeModelCatalogEntry[] = []
    for (const provider of data.all) {
        const providerId = typeof provider.id === 'string' ? provider.id : ''
        const providerName = typeof provider.name === 'string' ? provider.name : providerId
        const connected = connectedProviders.has(providerId)
        if (!authTypes.has(providerId)) {
            authTypes.set(providerId, connected ? await readStoredProviderAuthType(providerId) : null)
        }
        const authType = authTypes.get(providerId) || null
        const rawModels = provider.models && typeof provider.models === 'object'
            ? provider.models as Record<string, Record<string, unknown>>
            : {}

        for (const model of Object.values(rawModels)) {
            const record = model as ProviderModelRecord
            const id = typeof record.id === 'string' ? record.id : ''
            if (!id) {
                continue
            }
            if (!isModelVisibleForAuthType(providerId, id, authType)) {
                continue
            }

            const limitRecord = asRecord(record.limit)

            models.push({
                provider: providerId,
                providerName,
                id,
                name: typeof record.name === 'string' ? record.name : id,
                connected,
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
