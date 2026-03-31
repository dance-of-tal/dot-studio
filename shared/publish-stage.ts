export function sanitizePublishSegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-._]+|[-._]+$/g, '')
        || 'default'
}

export function stageFromWorkingDir(workingDir: string): string {
    const normalized = String(workingDir || '').replace(/\\/g, '/').replace(/\/+$/g, '')
    const base = normalized.split('/').filter(Boolean).pop() || 'default'
    return sanitizePublishSegment(base)
}

export function buildCanonicalStudioAssetUrn(
    kind: 'tal' | 'dance' | 'performer' | 'act',
    author: string,
    stage: string,
    name: string,
): string {
    const cleanAuthor = author.trim().replace(/^@/, '')
    if (!cleanAuthor) {
        throw new Error('Author is required.')
    }
    return `${kind}/@${cleanAuthor}/${sanitizePublishSegment(stage)}/${sanitizePublishSegment(name)}`
}
