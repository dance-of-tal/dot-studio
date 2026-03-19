import { extractMcpServerNamesFromConfig } from './mcp-config.js'

export type PerformerMcpPortability = {
    declaredMcpServerNames: string[]
    projectMcpMatches: string[]
    projectMcpMissing: string[]
}

export function resolvePerformerMcpPortability(
    mcpConfig: unknown,
    projectMcpServerNames: string[],
): PerformerMcpPortability {
    const declaredMcpServerNames = extractMcpServerNamesFromConfig(mcpConfig)
    const available = new Set(projectMcpServerNames.filter(Boolean))

    return {
        declaredMcpServerNames,
        projectMcpMatches: declaredMcpServerNames.filter((name) => available.has(name)),
        projectMcpMissing: declaredMcpServerNames.filter((name) => !available.has(name)),
    }
}
