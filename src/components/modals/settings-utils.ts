// Types and utility functions extracted from SettingsModal.tsx

import type { ProjectMcpCatalog, ProjectMcpEntryConfig } from '../../../shared/project-mcp'

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

export type SettingsTab = 'runtime' | 'project' | 'providers'
export type ProviderListFilter = 'popular' | 'connected' | 'all'
export type McpStatusTone = 'connected' | 'disconnected' | 'needs_auth' | 'failed' | 'disabled'

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

export type OpenCodeInfo = {
    connected: boolean
    url: string
    error?: string
    managed?: boolean
    mode?: 'managed' | 'external'
    restartAvailable?: boolean
    project?: {
        worktree?: string
    }
}

export type ProjectConfig = {
    share?: 'manual' | 'auto' | 'disabled'
    username?: string
    disabled_providers?: string[]
    enabled_providers?: string[]
    mcp?: ProjectMcpCatalog
}

export type McpKVPair = { key: string; value: string }

export type ProjectMcpEntryDraft = {
    key: string
    name: string
    enabled: boolean
    transport: 'stdio' | 'http'
    timeoutText: string

    // STDIO fields
    command: string
    args: string[]
    env: McpKVPair[]

    // Streamable HTTP fields
    url: string
    headers: McpKVPair[]

    // OAuth (for remote)
    oauthEnabled: boolean
    oauthClientId: string
    oauthClientSecret: string
    oauthScope: string
}

/** Auto-detect: server text starting with http(s):// is a remote MCP server */
export function isRemoteServer(serverText: string): boolean {
    const trimmed = serverText.trim().toLowerCase()
    return trimmed.startsWith('http://') || trimmed.startsWith('https://')
}

export function isRemoteDraft(draft: ProjectMcpEntryDraft): boolean {
    return draft.transport === 'http'
}

export type ProjectSettingsDraft = {
    share: 'manual' | 'auto' | 'disabled'
    username: string
    visibleProviders: Record<string, boolean>
    mcpEntries: ProjectMcpEntryDraft[]
}

export type ProjectConfigMeta = {
    exists: boolean
    path: string
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

export function labelForAuthMethod(method: ProviderAuthMethod) {
    if (method.type === 'api') {
        return 'Enter API Key'
    }
    const normalized = method.label.toLowerCase()
    if (normalized.includes('browser')) return method.label
    if (normalized.includes('code')) return method.label
    return `Connect with ${method.label}`
}

export function mergeProviders(
    providers: ProviderSummary[],
    authMethods: Record<string, ProviderAuthMethod[]>,
): ProviderCard[] {
    const providerMap = new Map<string, ProviderCard>()

    for (const provider of providers) {
        providerMap.set(provider.id, {
            ...provider,
            authMethods: authMethods[provider.id] || [],
        })
    }

    for (const [id, methods] of Object.entries(authMethods)) {
        const existing = providerMap.get(id)
        providerMap.set(id, {
            id,
            name: existing?.name || id,
            source: existing?.source || 'builtin',
            env: existing?.env || [],
            connected: existing?.connected || false,
            modelCount: existing?.modelCount || 0,
            defaultModel: existing?.defaultModel || null,
            authMethods: methods,
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

export function buildProjectDraft(
    providers: ProviderCard[],
    config: ProjectConfig,
): ProjectSettingsDraft {
    const enabledProviders = Array.isArray(config.enabled_providers) ? config.enabled_providers : []
    const disabledProviders = new Set(Array.isArray(config.disabled_providers) ? config.disabled_providers : [])
    const hasWhitelist = enabledProviders.length > 0
    const visibleProviders = providers.reduce<Record<string, boolean>>((acc, provider) => {
        acc[provider.id] = hasWhitelist
            ? enabledProviders.includes(provider.id)
            : !disabledProviders.has(provider.id)
        return acc
    }, {})

    return {
        share: config.share || 'manual',
        username: config.username || '',
        visibleProviders,
        mcpEntries: buildProjectMcpDrafts(config.mcp || {}),
    }
}

export function isProjectDraftEqual(left: ProjectSettingsDraft | null, right: ProjectSettingsDraft | null) {
    return JSON.stringify(left) === JSON.stringify(right)
}

function recordFromKVPairs(pairs: McpKVPair[]): Record<string, string> | undefined {
    const filtered = pairs.filter((p) => p.key.trim())
    if (filtered.length === 0) return undefined
    return Object.fromEntries(filtered.map((p) => [p.key.trim(), p.value.trim()]))
}

function kvPairsFromRecord(record: Record<string, string> | undefined): McpKVPair[] {
    if (!record) return []
    return Object.entries(record).map(([key, value]) => ({ key, value }))
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

function blankDraft(key: string, name: string): ProjectMcpEntryDraft {
    return {
        key,
        name,
        enabled: true,
        transport: 'stdio',
        timeoutText: '',
        command: '',
        args: [],
        env: [],
        url: '',
        headers: [],
        oauthEnabled: true,
        oauthClientId: '',
        oauthClientSecret: '',
        oauthScope: '',
    }
}

export function buildProjectMcpDrafts(catalog: ProjectMcpCatalog): ProjectMcpEntryDraft[] {
    return Object.entries(catalog)
        .map(([name, rawEntry]) => {
            const entry = rawEntry as ProjectMcpEntryConfig
            const base = blankDraft(`mcp:${name}`, name)

            if ('type' in entry && entry.type === 'remote') {
                return {
                    ...base,
                    enabled: entry.enabled !== false,
                    transport: 'http' as const,
                    timeoutText: typeof entry.timeout === 'number' ? String(entry.timeout) : '',
                    url: entry.url,
                    headers: kvPairsFromRecord(entry.headers),
                    oauthEnabled: entry.oauth !== false,
                    oauthClientId: entry.oauth && typeof entry.oauth === 'object' ? entry.oauth.clientId || '' : '',
                    oauthClientSecret: entry.oauth && typeof entry.oauth === 'object' ? entry.oauth.clientSecret || '' : '',
                    oauthScope: entry.oauth && typeof entry.oauth === 'object' ? entry.oauth.scope || '' : '',
                }
            }

            if ('type' in entry && entry.type === 'local') {
                const [cmd, ...args] = entry.command
                return {
                    ...base,
                    enabled: entry.enabled !== false,
                    transport: 'stdio' as const,
                    timeoutText: typeof entry.timeout === 'number' ? String(entry.timeout) : '',
                    command: cmd || '',
                    args,
                    env: kvPairsFromRecord(entry.environment),
                }
            }

            return { ...base, enabled: entry.enabled !== false }
        })
        .sort((left, right) => left.name.localeCompare(right.name))
}

export function serializeProjectMcpEntries(entries: ProjectMcpEntryDraft[]): ProjectMcpCatalog {
    return Object.fromEntries(
        entries
            .filter((entry) => entry.name.trim())
            .map((entry): [string, ProjectMcpEntryConfig] => {
                const name = entry.name.trim()
                const timeout = entry.timeoutText.trim() ? Number(entry.timeoutText.trim()) : undefined

                if (entry.transport === 'http') {
                    const headers = recordFromKVPairs(entry.headers)
                    return [name, {
                        type: 'remote',
                        url: entry.url.trim(),
                        enabled: entry.enabled,
                        ...(typeof timeout === 'number' && Number.isFinite(timeout) ? { timeout } : {}),
                        ...(headers ? { headers } : {}),
                        ...(entry.oauthEnabled
                            ? {
                                oauth: {
                                    ...(entry.oauthClientId.trim() ? { clientId: entry.oauthClientId.trim() } : {}),
                                    ...(entry.oauthClientSecret.trim() ? { clientSecret: entry.oauthClientSecret.trim() } : {}),
                                    ...(entry.oauthScope.trim() ? { scope: entry.oauthScope.trim() } : {}),
                                },
                            }
                            : { oauth: false }),
                    }]
                }

                const command = [entry.command.trim(), ...entry.args].filter(Boolean)
                const environment = recordFromKVPairs(entry.env)

                return [name, {
                    type: 'local',
                    command,
                    enabled: entry.enabled,
                    ...(typeof timeout === 'number' && Number.isFinite(timeout) ? { timeout } : {}),
                    ...(environment ? { environment } : {}),
                }]
            }),
    )
}
