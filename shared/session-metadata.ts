const SESSION_TITLE_PREFIX = 'DOT Studio:'
const SESSION_METADATA_PATTERN = /^DOT Studio:\s*(.*?)\s*\[studio:([^:\]]+):(.*)\]\s*$/

export function buildStudioSessionTitle(performerId: string, performerName: string, configHash: string): string {
    return `${SESSION_TITLE_PREFIX} ${performerName} [studio:${performerId}:${configHash}]`
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
