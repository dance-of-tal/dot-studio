export function diagnosticMatchesWorkingDir(uri: string, workingDir: string) {
    if (!workingDir) {
        return true
    }

    try {
        if (uri.startsWith('file://')) {
            const filePath = decodeURIComponent(new URL(uri).pathname)
            return filePath.startsWith(workingDir)
        }
    } catch {
        return false
    }

    return uri.includes(workingDir)
}

export function extractEventErrorMessage(error: unknown): string {
    const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null
    const dataRecord = errorRecord?.data && typeof errorRecord.data === 'object'
        ? errorRecord.data as Record<string, unknown>
        : null
    if (typeof dataRecord?.message === 'string' && dataRecord.message.trim()) {
        return dataRecord.message.trim()
    }
    if (typeof errorRecord?.message === 'string' && errorRecord.message.trim()) {
        return errorRecord.message.trim()
    }
    try {
        return `OpenCode session failed: ${JSON.stringify(error)}`
    } catch {
        return 'OpenCode session failed.'
    }
}
