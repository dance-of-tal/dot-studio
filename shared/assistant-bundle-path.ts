const RESERVED_ROOT_PATHS = new Set(['SKILL.md', 'draft.json'])

export function normalizeAssistantBundlePath(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null

    const normalized = value
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, '')

    if (!normalized || normalized.includes('\0')) {
        return null
    }

    if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
        return null
    }

    const parts = normalized.split('/').filter(Boolean)
    if (parts.length === 0) {
        return null
    }
    if (parts.some((part) => part === '.' || part === '..')) {
        return null
    }

    const joined = parts.join('/')
    if (RESERVED_ROOT_PATHS.has(joined)) {
        return null
    }

    return joined
}
