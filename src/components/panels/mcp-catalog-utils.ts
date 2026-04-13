import type { McpCatalog, McpEntryConfig } from '../../../shared/mcp-catalog'
import type { PerformerNode } from '../../types'
import { applyPerformerPatch } from '../../store/workspace-helpers'

export type McpKVPair = { key: string; value: string }

export type McpEntryDraft = {
    key: string
    name: string
    transport: 'stdio' | 'http'
    enabled: boolean
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

export type McpCatalogRenameImpact = {
    key: string
    previousName: string
    nextName: string
    affectedPerformerIds: string[]
}

export type McpCatalogDeleteImpact = {
    key: string
    name: string
    affectedPerformerIds: string[]
}

export type McpCatalogImpact = {
    renames: McpCatalogRenameImpact[]
    deletes: McpCatalogDeleteImpact[]
    affectedPerformerIds: string[]
    affectedPerformerNames: string[]
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

export function createMcpEntryDraft(key: string, name = ''): McpEntryDraft {
    return {
        key,
        name,
        transport: 'stdio',
        enabled: true,
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

export function cloneMcpDraftEntries(entries: McpEntryDraft[]): McpEntryDraft[] {
    return entries.map((entry) => ({
        ...entry,
        args: [...entry.args],
        env: entry.env.map((pair) => ({ ...pair })),
        headers: entry.headers.map((pair) => ({ ...pair })),
    }))
}

function persistedName(entry: McpEntryDraft | undefined) {
    return entry?.name.trim() || ''
}

function performerReferencesMcpName(performer: PerformerNode, serverName: string) {
    return performer.mcpServerNames.includes(serverName)
        || Object.values(performer.mcpBindingMap || {}).includes(serverName)
}

export function buildMcpDrafts(catalog: McpCatalog): McpEntryDraft[] {
    return Object.entries(catalog)
        .map(([name, rawEntry]) => {
            const entry = rawEntry as McpEntryConfig
            const base = createMcpEntryDraft(`mcp:${name}`, name)

            if (entry.type === 'remote') {
                return {
                    ...base,
                    transport: 'http' as const,
                    enabled: entry.enabled !== false,
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
                enabled: entry.enabled !== false,
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

export function buildMcpCatalogImpact(
    previousEntries: McpEntryDraft[],
    nextEntries: McpEntryDraft[],
    performers: PerformerNode[],
): McpCatalogImpact {
    const nextByKey = new Map(nextEntries.map((entry) => [entry.key, entry]))
    const renames: McpCatalogRenameImpact[] = []
    const deletes: McpCatalogDeleteImpact[] = []

    for (const previousEntry of previousEntries) {
        const previousName = persistedName(previousEntry)
        if (!previousName) {
            continue
        }

        const nextEntry = nextByKey.get(previousEntry.key)
        const nextName = persistedName(nextEntry)
        const affectedPerformerIds = performers
            .filter((performer) => performerReferencesMcpName(performer, previousName))
            .map((performer) => performer.id)

        if (!nextName) {
            deletes.push({
                key: previousEntry.key,
                name: previousName,
                affectedPerformerIds,
            })
            continue
        }

        if (nextName !== previousName) {
            renames.push({
                key: previousEntry.key,
                previousName,
                nextName,
                affectedPerformerIds,
            })
        }
    }

    const affectedPerformerIds = Array.from(new Set([
        ...renames.flatMap((rename) => rename.affectedPerformerIds),
        ...deletes.flatMap((item) => item.affectedPerformerIds),
    ]))
    const affectedPerformerNames = performers
        .filter((performer) => affectedPerformerIds.includes(performer.id))
        .map((performer) => performer.name)
        .sort((left, right) => left.localeCompare(right))

    return {
        renames,
        deletes,
        affectedPerformerIds,
        affectedPerformerNames,
    }
}

export function hasMcpCatalogImpact(impact: McpCatalogImpact) {
    return impact.affectedPerformerIds.length > 0
}

export function applyMcpCatalogImpactToPerformers(
    performers: PerformerNode[],
    impact: McpCatalogImpact,
): PerformerNode[] {
    if (!hasMcpCatalogImpact(impact)) {
        return performers
    }

    const renameMap = new Map(impact.renames.map((rename) => [rename.previousName, rename.nextName]))
    const deletedNames = new Set(impact.deletes.map((item) => item.name))
    let changedAny = false

    const nextPerformers = performers.map((performer) => {
        let changed = false

        const nextMcpServerNames = Array.from(new Set(
            performer.mcpServerNames
                .map((name) => {
                    const nextName = renameMap.get(name) || name
                    if (nextName !== name) {
                        changed = true
                    }
                    return nextName
                })
                .filter((name) => {
                    const keep = !deletedNames.has(name)
                    changed = changed || !keep
                    return keep
                }),
        ))

        const nextMcpBindingMap = Object.fromEntries(
            Object.entries(performer.mcpBindingMap || {}).flatMap(([placeholderName, serverName]) => {
                if (deletedNames.has(serverName)) {
                    changed = true
                    return []
                }

                const nextServerName = renameMap.get(serverName) || serverName
                if (nextServerName !== serverName) {
                    changed = true
                }
                return [[placeholderName, nextServerName]]
            }),
        )

        if (
            !changed
            && nextMcpServerNames.length === performer.mcpServerNames.length
            && Object.keys(nextMcpBindingMap).length === Object.keys(performer.mcpBindingMap || {}).length
        ) {
            return performer
        }

        changedAny = true
        return applyPerformerPatch(performer, {
            mcpServerNames: nextMcpServerNames,
            mcpBindingMap: nextMcpBindingMap,
        })
    })

    return changedAny ? nextPerformers : performers
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
                        ...(entry.enabled === false ? { enabled: false } : {}),
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
                    ...(entry.enabled === false ? { enabled: false } : {}),
                    ...(typeof timeout === 'number' && Number.isFinite(timeout) ? { timeout } : {}),
                    ...(environment ? { environment } : {}),
                }]
            }),
    )
}
