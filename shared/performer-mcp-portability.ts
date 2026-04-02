import { extractMcpServerNamesFromConfig } from './mcp-config.js'

export type PerformerMcpPortability = {
    declaredMcpServerNames: string[]
    matchedMcpServerNames: string[]
    missingMcpServerNames: string[]
}

export function resolvePerformerMcpPortability(
    mcpConfig: unknown,
    availableMcpServerNames: string[],
): PerformerMcpPortability {
    const declaredMcpServerNames = extractMcpServerNamesFromConfig(mcpConfig)
    const available = new Set(availableMcpServerNames.filter(Boolean))

    return {
        declaredMcpServerNames,
        matchedMcpServerNames: declaredMcpServerNames.filter((name) => available.has(name)),
        missingMcpServerNames: declaredMcpServerNames.filter((name) => !available.has(name)),
    }
}
