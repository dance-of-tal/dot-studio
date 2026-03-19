const SESSION_TITLE_PREFIX = 'DOT Studio:'
const SESSION_METADATA_PATTERN = /^DOT Studio:\s*(.*?)\s*\[studio:([^:\]]+):(.*)\]\s*$/

export function buildStudioSessionTitle(performerId: string, performerName: string, configHash: string, executionMode?: string): string {
    const safeLabel = executionMode === 'safe' ? '[SAFE] ' : ''
    return `${SESSION_TITLE_PREFIX} ${safeLabel}${performerName} [studio:${performerId}:${configHash}]`
}

export function parseStudioSessionTitle(title: string | undefined | null): {
    label: string
    performerId: string
    configHash: string
} | null {
    if (!title || !title.startsWith(SESSION_TITLE_PREFIX)) {
        return null
    }

    const match = title.match(SESSION_METADATA_PATTERN)
    if (!match) {
        return null
    }

    return {
        label: match[1].trim(),
        performerId: match[2],
        configHash: match[3],
    }
}

export function renameStudioSessionTitle(
    title: string | undefined | null,
    nextLabel: string,
): string | null {
    const parsed = parseStudioSessionTitle(title)
    if (!parsed) {
        return null
    }
    return buildStudioSessionTitle(parsed.performerId, nextLabel.trim(), parsed.configHash)
}
