const SESSION_TITLE_PREFIX = 'DOT Studio:'
const SESSION_METADATA_PATTERN = /^DOT Studio:\s*(.*?)\s*\[studio:([^:\]]+):(.*)\]\s*$/
const MAX_PROVISIONAL_THREAD_TITLE_LENGTH = 80

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

export function deriveProvisionalThreadTitle(message: string | undefined | null): string | null {
    if (typeof message !== 'string') {
        return null
    }

    const normalized = message
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (!normalized) {
        return null
    }

    if (normalized.length <= MAX_PROVISIONAL_THREAD_TITLE_LENGTH) {
        return normalized
    }

    return `${normalized.slice(0, MAX_PROVISIONAL_THREAD_TITLE_LENGTH - 1).trimEnd()}…`
}
