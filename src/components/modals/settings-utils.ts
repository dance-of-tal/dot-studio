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
    hasPaidModels: boolean
}

export type ProviderCard = ProviderSummary & {
    authMethods: ProviderAuthMethod[]
}

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

export const POPULAR_PROVIDER_IDS = [
    'opencode',
    'opencode-go',
    'anthropic',
    'github-copilot',
    'openai',
    'google',
    'openrouter',
    'vercel',
] as const

type PopularProviderId = typeof POPULAR_PROVIDER_IDS[number]

// ── Utility functions ───────────────────────────────────

function isPopularProvider(id: string): id is PopularProviderId {
    return POPULAR_PROVIDER_IDS.includes(id as PopularProviderId)
}

function providerRank(id: string) {
    const index = POPULAR_PROVIDER_IDS.indexOf(id as PopularProviderId)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function compareProviderCards(left: Pick<ProviderCard, 'id' | 'name' | 'connected'>, right: Pick<ProviderCard, 'id' | 'name' | 'connected'>) {
    const rankDiff = providerRank(left.id) - providerRank(right.id)
    if (rankDiff !== 0) {
        return rankDiff
    }
    if (left.connected !== right.connected) {
        return left.connected ? -1 : 1
    }
    return left.name.localeCompare(right.name)
}

export function providerSupportsApiKey(provider: ProviderCard) {
    return provider.authMethods.some((method) => method.type === 'api') || provider.env.length > 0
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

export function buildProviderCards(
    providers: ProviderSummary[],
    authMethods: Record<string, ProviderAuthMethod[]>,
): ProviderCard[] {
    return providers
        .map((provider) => ({
            ...provider,
            authMethods: readProviderAuthMethods(authMethods[provider.id]),
        }))
        .filter((provider) => provider.connected || provider.authMethods.length > 0 || isPopularProvider(provider.id))
        .sort(compareProviderCards)
}

export function getConnectedProviderCards(providers: ProviderCard[]) {
    return providers.filter((provider) => provider.connected && (provider.id !== 'opencode' || provider.hasPaidModels))
}

export function getPopularProviderCards(providers: ProviderCard[]) {
    const connectedProviderIds = new Set(getConnectedProviderCards(providers).map((provider) => provider.id))

    return providers.filter((provider) => (
        !connectedProviderIds.has(provider.id)
        && isPopularProvider(provider.id)
    ))
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
