export type ProjectMcpLocalConfig = {
    type: 'local'
    command: string[]
    environment?: Record<string, string>
    enabled?: boolean
    timeout?: number
}

export type ProjectMcpRemoteOAuthConfig = {
    clientId?: string
    clientSecret?: string
    scope?: string
}

export type ProjectMcpRemoteConfig = {
    type: 'remote'
    url: string
    enabled?: boolean
    headers?: Record<string, string>
    oauth?: ProjectMcpRemoteOAuthConfig | false
    timeout?: number
}

export type ProjectMcpEnabledOnlyConfig = {
    enabled: boolean
}

export type ProjectMcpEntryConfig =
    | ProjectMcpLocalConfig
    | ProjectMcpRemoteConfig
    | ProjectMcpEnabledOnlyConfig

export type ProjectMcpCatalog = Record<string, ProjectMcpEntryConfig>

export function isProjectMcpCatalog(value: unknown): value is ProjectMcpCatalog {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function extractProjectMcpCatalog(config: unknown): ProjectMcpCatalog {
    if (!config || typeof config !== 'object') {
        return {}
    }
    const record = config as Record<string, unknown>
    return isProjectMcpCatalog(record.mcp) ? record.mcp : {}
}

export function projectMcpServerNames(config: unknown): string[] {
    return Object.keys(extractProjectMcpCatalog(config))
}

export function projectMcpEntryEnabled(entry: ProjectMcpEntryConfig | null | undefined): boolean {
    return entry?.enabled !== false
}

export function projectMcpEntryType(entry: ProjectMcpEntryConfig | null | undefined): 'local' | 'remote' | 'toggle' {
    if (entry && typeof entry === 'object' && 'type' in entry) {
        return entry.type === 'remote' ? 'remote' : 'local'
    }
    return 'toggle'
}
