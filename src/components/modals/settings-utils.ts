// Types and utility functions extracted from SettingsModal.tsx

import type {
    ProviderApiKeyAuth,
    ProviderAuthMethod,
    ProviderAuthPrompt,
    ProviderSummary,
} from '../../../shared/provider-auth'

export type {
    ProviderAuthMethod,
    ProviderAuthPrompt,
    ProviderSummary,
} from '../../../shared/provider-auth'

export type ProviderCard = ProviderSummary & {
    authMethods: ProviderAuthMethod[]
}

export type ProviderAuthOption = {
    method: ProviderAuthMethod
    methodIndex: number
    source: 'provider' | 'compat'
}

export type ProviderListFilter = 'popular' | 'connected' | 'all'
export type McpStatusTone = 'connected' | 'disconnected' | 'needs_auth' | 'failed'

export type OauthFlow = {
    authType: 'oauth' | 'api'
    methodIndex: number
    label: string
    mode: 'prompt' | 'auto' | 'code' | 'api'
    url?: string
    instructions: string
    code: string
    submitting: boolean
    error?: string
    prompts: ProviderAuthPrompt[]
    promptValues: Record<string, string>
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

export function buildProviderAuthOptions(provider: ProviderCard): ProviderAuthOption[] {
    const authMethods = provider.authMethods.map((method, methodIndex) => ({
        method,
        methodIndex,
        source: 'provider' as const,
    }))
    const apiMethods = authMethods.filter(({ method }) => method.type === 'api')
    const oauthMethods = authMethods.filter(({ method }) => method.type === 'oauth')

    if (provider.env.length === 0 || apiMethods.length > 0) {
        return [...apiMethods, ...oauthMethods]
    }

    // Compatibility fallback while some OpenCode providers still expose only env-backed API auth.
    return [
        {
            method: { type: 'api', label: 'API Key' },
            methodIndex: -1,
            source: 'compat',
        },
        ...oauthMethods,
    ]
}

export function shouldShowProviderConnectModal(
    provider: ProviderCard | null | undefined,
    flow: OauthFlow | undefined,
) {
    if (!provider) {
        return false
    }

    if (flow) {
        return true
    }

    return buildProviderAuthOptions(provider).length > 0 || !provider.connected
}

export function shouldAutoCloseProviderConnectModal(
    provider: ProviderCard | null | undefined,
    flow: OauthFlow | undefined,
) {
    return !!provider && provider.connected && !flow
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

export function createPromptValueDraft(
    prompts: ProviderAuthPrompt[] | undefined,
    current: Record<string, string> = {},
) {
    const next = { ...current }
    for (const prompt of prompts || []) {
        if (typeof next[prompt.key] === 'string') {
            continue
        }
        if (prompt.type === 'select') {
            next[prompt.key] = prompt.options[0]?.value || ''
            continue
        }
        next[prompt.key] = ''
    }
    return next
}

export function getVisibleProviderAuthPrompts(
    prompts: ProviderAuthPrompt[] | undefined,
    values: Record<string, string>,
) {
    return (prompts || []).filter((prompt) => {
        if (!prompt.when) {
            return true
        }
        const actual = values[prompt.when.key] || ''
        return prompt.when.op === 'eq'
            ? actual === prompt.when.value
            : actual !== prompt.when.value
    })
}

export function buildVisibleProviderPromptInputs(
    prompts: ProviderAuthPrompt[] | undefined,
    values: Record<string, string>,
) {
    const entries = getVisibleProviderAuthPrompts(prompts, values)
        .map((prompt) => [prompt.key, (values[prompt.key] || '').trim()] as const)
        .filter(([, value]) => value.length > 0)

    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function areVisibleProviderPromptsComplete(
    prompts: ProviderAuthPrompt[] | undefined,
    values: Record<string, string>,
) {
    return getVisibleProviderAuthPrompts(prompts, values)
        .every((prompt) => (values[prompt.key] || '').trim().length > 0)
}

export function buildApiKeyProviderAuth(
    key: string,
    prompts: ProviderAuthPrompt[] | undefined,
    values: Record<string, string>,
): ProviderApiKeyAuth | null {
    const trimmedKey = key.trim()
    if (!trimmedKey) {
        return null
    }

    const metadata = buildVisibleProviderPromptInputs(prompts, values)
    return metadata
        ? { type: 'api', key: trimmedKey, metadata }
        : { type: 'api', key: trimmedKey }
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

export function getAllProviderCards(providers: ProviderCard[]) {
    const visibleProviderIds = new Set([
        ...getConnectedProviderCards(providers).map((provider) => provider.id),
        ...getPopularProviderCards(providers).map((provider) => provider.id),
    ])

    return providers.filter((provider) => !visibleProviderIds.has(provider.id))
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
