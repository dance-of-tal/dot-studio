import type { McpCatalog, McpEntryConfig } from '../../../shared/mcp-catalog'

export type McpKVPair = { key: string; value: string }

export type McpEntryDraft = {
    key: string
    name: string
    transport: 'stdio' | 'http'
    timeoutText: string
    command: string
    args: string[]
    env: McpKVPair[]
    url: string
    headers: McpKVPair[]
    oauthEnabled: boolean
    oauthClientId: string
    oauthClientSecret: string
    oauthScope: string
}

export function isRemoteDraft(draft: McpEntryDraft): boolean {
    return draft.transport === 'http'
}

function recordFromKVPairs(pairs: McpKVPair[]): Record<string, string> | undefined {
    const filtered = pairs.filter((pair) => pair.key.trim())
    if (filtered.length === 0) return undefined
    return Object.fromEntries(filtered.map((pair) => [pair.key.trim(), pair.value.trim()]))
}

function kvPairsFromRecord(record: Record<string, string> | undefined): McpKVPair[] {
    if (!record) return []
    return Object.entries(record).map(([key, value]) => ({ key, value }))
}

function blankDraft(key: string, name: string): McpEntryDraft {
    return {
        key,
        name,
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

export function buildMcpDrafts(catalog: McpCatalog): McpEntryDraft[] {
    return Object.entries(catalog)
        .map(([name, rawEntry]) => {
            const entry = rawEntry as McpEntryConfig
            const base = blankDraft(`mcp:${name}`, name)

            if (entry.type === 'remote') {
                return {
                    ...base,
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

            const [command, ...args] = entry.command
            return {
                ...base,
                transport: 'stdio' as const,
                timeoutText: typeof entry.timeout === 'number' ? String(entry.timeout) : '',
                command: command || '',
                args,
                env: kvPairsFromRecord(entry.environment),
            }
        })
        .sort((left, right) => left.name.localeCompare(right.name))
}

export function getMcpEntryValidationError(entries: McpEntryDraft[]): string | null {
    const seenNames = new Set<string>()

    for (const entry of entries) {
        const name = entry.name.trim()
        if (!name) continue

        if (seenNames.has(name)) {
            return `MCP '${name}' is duplicated. Server names must be unique.`
        }
        seenNames.add(name)

        if (entry.transport === 'stdio' && !entry.command.trim()) {
            return `MCP '${name}' needs a command before saving.`
        }

        if (entry.transport === 'http' && !entry.url.trim()) {
            return `MCP '${name}' needs a URL before saving.`
        }
    }

    return null
}

export function serializeMcpEntries(entries: McpEntryDraft[]): McpCatalog {
    return Object.fromEntries(
        entries
            .filter((entry) => entry.name.trim())
            .map((entry): [string, McpEntryConfig] => {
                const name = entry.name.trim()
                const timeout = entry.timeoutText.trim() ? Number(entry.timeoutText.trim()) : undefined

                if (entry.transport === 'http') {
                    const headers = recordFromKVPairs(entry.headers)
                    return [name, {
                        type: 'remote',
                        url: entry.url.trim(),
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
                    ...(typeof timeout === 'number' && Number.isFinite(timeout) ? { timeout } : {}),
                    ...(environment ? { environment } : {}),
                }]
            }),
    )
}
