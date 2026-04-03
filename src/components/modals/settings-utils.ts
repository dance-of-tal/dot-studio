// Types and utility functions extracted from SettingsModal.tsx

export type ProviderAuthMethod = {
    type: 'oauth' | 'api'
    label: string
}

export type ProviderSummary = {
    id: string
    name: string
    source: string
    env: string[]
    connected: boolean
    modelCount: number
    defaultModel: string | null
}

export type ProviderCard = ProviderSummary & {
    authMethods: ProviderAuthMethod[]
}

export type ProviderConnections = Record<string, {
    connected: boolean
    authType?: string
}>

export type ProviderListFilter = 'popular' | 'connected' | 'all'
export type McpStatusTone = 'connected' | 'disconnected' | 'needs_auth' | 'failed'

export type OauthFlow = {
    methodIndex: number
    label: string
    mode: 'auto' | 'code' | 'api'
    url?: string
    instructions: string
    code: string
    submitting: boolean
    error?: string
}

export type ConnectedModel = {
    provider: string
    providerName: string
    id: string
    name: string
    connected: boolean
    context: number
    toolCall: boolean
    reasoning: boolean
}

export type ModelPickerState = {
    providerId: string
    providerName: string
    performerId: string | null
    performerName: string | null
    models: ConnectedModel[]
    query: string
}

/** Auto-detect: server text starting with http(s):// is a remote MCP server */
export function isRemoteServer(serverText: string): boolean {
    const trimmed = serverText.trim().toLowerCase()
    return trimmed.startsWith('http://') || trimmed.startsWith('https://')
}

// ── Constants ───────────────────────────────────────────

export const POPULAR_PROVIDER_HINTS = ['anthropic', 'openai', 'google', 'gemini', 'xai', 'grok', 'github-copilot', 'gitlab', 'opencode']

// ── Utility functions ───────────────────────────────────

export function isPopularProvider(id: string) {
    const normalized = id.toLowerCase()
    return POPULAR_PROVIDER_HINTS.some((hint) => normalized === hint || normalized.includes(hint))
}

export function providerRank(id: string) {
    const normalized = id.toLowerCase()
    const index = POPULAR_PROVIDER_HINTS.findIndex((hint) => normalized === hint || normalized.includes(hint))
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export function providerSupportsApiKey(provider: ProviderCard) {
    return provider.authMethods.some((method) => method.type === 'api') || provider.env.length > 0
}

export function isBuiltinOpenCodeProvider(provider: Pick<ProviderSummary, 'id' | 'source'>) {
    return provider.id === 'opencode' && provider.source !== 'custom'
}

export function shouldDisplayConnectedProvider(
    provider: Pick<ProviderSummary, 'connected' | 'id' | 'source'>,
) {
    return provider.connected && !isBuiltinOpenCodeProvider(provider)
}

export function getProviderAuthSuccessAction(
    selectedPerformer: { id: string; name: string } | null,
) {
    return selectedPerformer ? 'pick-model' : 'close-modal'
}

export function labelForAuthMethod(method: ProviderAuthMethod) {
    if (method.type === 'api') {
        return 'Enter API Key'
    }
    const normalized = method.label.toLowerCase()
    if (normalized.includes('browser')) return method.label
    if (normalized.includes('code')) return method.label
    return `Connect with ${method.label}`
}

function readProviderAuthMethods(value: ProviderAuthMethod[] | undefined): ProviderAuthMethod[] {
    return Array.isArray(value) ? value : []
}

function readProviderConnected(value: ProviderConnections[string] | undefined): boolean {
    return value?.connected === true
}

export function mergeProviders(
    providers: ProviderSummary[],
    authMethods: Record<string, ProviderAuthMethod[]>,
    connections: ProviderConnections,
): ProviderCard[] {
    const providerMap = new Map<string, ProviderCard>()

    for (const provider of providers) {
        const providerAuthMethods = readProviderAuthMethods(authMethods[provider.id])
        const providerConnections = connections[provider.id]
        providerMap.set(provider.id, {
            ...provider,
            connected: provider.connected || readProviderConnected(providerConnections),
            authMethods: providerAuthMethods,
        })
    }

    for (const id of new Set([
        ...Object.keys(authMethods),
        ...Object.keys(connections),
    ])) {
        const existing = providerMap.get(id)
        const providerAuthMethods = readProviderAuthMethods(authMethods[id])
        const providerConnections = connections[id]
        providerMap.set(id, {
            id,
            name: existing?.name || id,
            source: existing?.source || 'builtin',
            env: existing?.env || [],
            connected: existing?.connected || readProviderConnected(providerConnections),
            modelCount: existing?.modelCount || 0,
            defaultModel: existing?.defaultModel || null,
            authMethods: providerAuthMethods,
        })
    }

    return Array.from(providerMap.values())
        .filter((provider) => provider.connected || provider.authMethods.length > 0 || isPopularProvider(provider.id))
        .sort((a, b) => {
            const rankDiff = providerRank(a.id) - providerRank(b.id)
            if (rankDiff !== 0) {
                return rankDiff
            }
            if (a.connected !== b.connected) {
                return a.connected ? -1 : 1
            }
            return a.name.localeCompare(b.name)
        })
}

export function parseKeyValueText(text: string): Record<string, string> | undefined {
    const entries = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const idx = line.indexOf('=')
            if (idx === -1) {
                return [line.trim(), ''] as const
            }
            return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] as const
        })
        .filter(([key]) => !!key)

    if (entries.length === 0) {
        return undefined
    }

    return Object.fromEntries(entries)
}
