export type McpLocalConfig = {
    type: 'local'
    command: string[]
    enabled?: boolean
    environment?: Record<string, string>
    timeout?: number
}

export type McpRemoteOAuthConfig = {
    clientId?: string
    clientSecret?: string
    scope?: string
}

export type McpRemoteConfig = {
    type: 'remote'
    url: string
    enabled?: boolean
    headers?: Record<string, string>
    oauth?: McpRemoteOAuthConfig | false
    timeout?: number
}

export type McpEntryConfig =
    | McpLocalConfig
    | McpRemoteConfig

export type McpCatalog = Record<string, McpEntryConfig>

export function mcpToolPattern(name: string): string {
    return `${name}_*`
}

export function buildMcpToolOverrides(catalog: McpCatalog): Record<string, boolean> {
    return Object.fromEntries(
        Object.keys(catalog)
            .sort((left, right) => left.localeCompare(right))
            .map((name) => [mcpToolPattern(name), false]),
    )
}

export function mergeMcpToolOverrides(
    currentTools: Record<string, unknown> | null | undefined,
    previousCatalog: McpCatalog,
    nextCatalog: McpCatalog,
): Record<string, unknown> {
    const managedPatterns = new Set(
        [...Object.keys(previousCatalog), ...Object.keys(nextCatalog)].map(mcpToolPattern),
    )

    const preservedEntries = Object.entries(currentTools || {}).filter(([toolName]) => !managedPatterns.has(toolName))

    return {
        ...Object.fromEntries(preservedEntries),
        ...buildMcpToolOverrides(nextCatalog),
    }
}

export function isMcpCatalog(value: unknown): value is McpCatalog {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function extractMcpCatalog(config: unknown): McpCatalog {
    if (!config || typeof config !== 'object') {
        return {}
    }
    const record = config as Record<string, unknown>
    return isMcpCatalog(record.mcp) ? record.mcp : {}
}

export function mcpServerNamesFromConfig(config: unknown): string[] {
    return Object.keys(extractMcpCatalog(config))
}

export function mcpEntryType(entry: McpEntryConfig | null | undefined): 'local' | 'remote' {
    if (entry && typeof entry === 'object' && 'type' in entry) {
        return entry.type === 'remote' ? 'remote' : 'local'
    }
    return 'local'
}
