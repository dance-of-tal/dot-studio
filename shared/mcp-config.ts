function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)))
}

export function extractMcpServerNamesFromConfig(value: unknown): string[] {
    if (!value || typeof value !== 'object') {
        return []
    }

    const record = value as Record<string, unknown>
    const nestedServers = record.servers
    if (Array.isArray(nestedServers)) {
        return unique(nestedServers.filter((item): item is string => typeof item === 'string'))
    }

    if (nestedServers && typeof nestedServers === 'object') {
        return unique(Object.keys(nestedServers as Record<string, unknown>))
    }

    return unique(
        Object.entries(record)
            .filter(([, config]) => config !== null && typeof config === 'object')
            .map(([name]) => name),
    )
}
