import type { ChatMessage } from '../../types'

export interface FileDiffInfo {
    file: string
    before: string
    after: string
    additions: number
    deletions: number
    status: 'added' | 'modified' | 'deleted'
    rawDiff?: string
}

type DiffSummary = Pick<FileDiffInfo, 'additions' | 'deletions'>

const EDIT_NAMES = new Set(['replace_in_file', 'multi_replace_file_content', 'str_replace_editor', 'replace_file_content', 'edit'])
const WRITE_NAMES = new Set(['write_to_file', 'create_file', 'write'])
const PATCH_NAMES = new Set(['apply_patch'])

function readString(value: Record<string, unknown> | undefined, ...keys: string[]) {
    let current: unknown = value
    for (const key of keys) {
        if (!current || typeof current !== 'object' || !(key in current)) {
            return null
        }
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'string' && current.trim() ? current : null
}

function readNumber(value: Record<string, unknown> | undefined, ...keys: string[]) {
    let current: unknown = value
    for (const key of keys) {
        if (!current || typeof current !== 'object' || !(key in current)) {
            return null
        }
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'number' && Number.isFinite(current) ? current : null
}

function countUnifiedDiffChanges(diff: string): DiffSummary {
    const lines = diff.split('\n')
    return {
        additions: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
        deletions: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
    }
}

function normalizeStatus(value: string | null | undefined, before: string, after: string): FileDiffInfo['status'] {
    if (value === 'added' || value === 'create' || value === 'created') {
        return 'added'
    }
    if (value === 'deleted' || value === 'delete' || value === 'removed') {
        return 'deleted'
    }
    if (!before && after) {
        return 'added'
    }
    if (before && !after) {
        return 'deleted'
    }
    return 'modified'
}

function upsertDiff(fileMap: Map<string, FileDiffInfo>, next: FileDiffInfo) {
    const existing = fileMap.get(next.file)
    if (!existing) {
        fileMap.set(next.file, next)
        return
    }
    fileMap.set(next.file, {
        ...existing,
        ...next,
        before: next.before || existing.before,
        after: next.after || existing.after,
        additions: Math.max(existing.additions, next.additions),
        deletions: Math.max(existing.deletions, next.deletions),
        status: next.status || existing.status,
        rawDiff: next.rawDiff || existing.rawDiff,
    })
}

function extractPath(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.path || input.TargetFile || input.file || input.filePath || input.AbsolutePath || '')
}

function normalizeToolMetadataDiffs(metadata: Record<string, unknown> | undefined): FileDiffInfo[] {
    const files = metadata?.files
    if (!Array.isArray(files)) {
        return []
    }
    return files.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
            return []
        }
        const record = entry as Record<string, unknown>
        const file = readString(record, 'relativePath')
            || readString(record, 'file')
            || readString(record, 'filePath')
            || readString(record, 'path')
        if (!file) {
            return []
        }
        const before = readString(record, 'before') || ''
        const after = readString(record, 'after') || ''
        const rawDiff = readString(record, 'diff') || readString(record, 'patch') || undefined
        const summary = rawDiff ? countUnifiedDiffChanges(rawDiff) : {
            additions: readNumber(record, 'additions') || (after ? after.split('\n').length : 0),
            deletions: readNumber(record, 'deletions') || (before ? before.split('\n').length : 0),
        }
        return [{
            file,
            before,
            after,
            additions: summary.additions,
            deletions: summary.deletions,
            status: normalizeStatus(readString(record, 'type') || readString(record, 'status'), before, after),
            ...(rawDiff ? { rawDiff } : {}),
        }]
    })
}

export function normalizeSessionDiffEntry(entry: Record<string, unknown>): FileDiffInfo | null {
    const file = readString(entry, 'file')
        || readString(entry, 'path')
        || readString(entry, 'relativePath')
        || readString(entry, 'post_name')
        || readString(entry, 'pre_name')
    if (!file) {
        return null
    }

    const before = readString(entry, 'before') || ''
    const after = readString(entry, 'after') || ''
    const rawDiff = readString(entry, 'diff') || readString(entry, 'patch') || undefined
    const changeSummary = rawDiff ? countUnifiedDiffChanges(rawDiff) : {
        additions: readNumber(entry, 'additions') || (after ? after.split('\n').length : 0),
        deletions: readNumber(entry, 'deletions') || (before ? before.split('\n').length : 0),
    }

    return {
        file,
        before,
        after,
        additions: changeSummary.additions,
        deletions: changeSummary.deletions,
        status: normalizeStatus(readString(entry, 'status') || readString(entry, 'type'), before, after),
        ...(rawDiff ? { rawDiff } : {}),
    }
}

export function normalizeSessionDiffEntries(entries: Array<Record<string, unknown>> | null | undefined): FileDiffInfo[] {
    if (!entries?.length) {
        return []
    }

    const fileMap = new Map<string, FileDiffInfo>()
    entries.forEach((entry) => {
        const normalized = normalizeSessionDiffEntry(entry)
        if (normalized) {
            upsertDiff(fileMap, normalized)
        }
    })
    return Array.from(fileMap.values())
}

export function collectSessionDiffs(messages: ChatMessage[]): FileDiffInfo[] {
    const fileMap = new Map<string, FileDiffInfo>()

    for (const msg of messages) {
        if (!msg.parts) continue
        for (const part of msg.parts) {
            if (part.type !== 'tool' || !part.tool) continue
            const tool = part.tool
            if (tool.status === 'error') continue

            for (const metadataDiff of normalizeToolMetadataDiffs(tool.metadata)) {
                upsertDiff(fileMap, metadataDiff)
            }

            const filePath = extractPath(tool.input)
            if (!filePath) continue

            if (EDIT_NAMES.has(tool.name)) {
                const oldStr = String(tool.input?.old_string || tool.input?.oldString || tool.input?.TargetContent || '')
                const newStr = String(tool.input?.new_string || tool.input?.newString || tool.input?.ReplacementContent || '')
                if (oldStr || newStr) {
                    upsertDiff(fileMap, {
                        file: filePath,
                        before: oldStr,
                        after: newStr,
                        additions: newStr ? newStr.split('\n').length : 0,
                        deletions: oldStr ? oldStr.split('\n').length : 0,
                        status: 'modified',
                    })
                }
                continue
            }

            if (WRITE_NAMES.has(tool.name)) {
                const content = String(tool.input?.content || tool.input?.CodeContent || '')
                upsertDiff(fileMap, {
                    file: filePath,
                    before: '',
                    after: content,
                    additions: content ? content.split('\n').length : 0,
                    deletions: 0,
                    status: 'added',
                })
                continue
            }

            if (PATCH_NAMES.has(tool.name)) {
                const diff = String(tool.input?.diff || tool.input?.patch || tool.input?.content || '')
                if (!diff) continue
                const summary = countUnifiedDiffChanges(diff)
                upsertDiff(fileMap, {
                    file: filePath,
                    before: '',
                    after: '',
                    additions: summary.additions,
                    deletions: summary.deletions,
                    status: 'modified',
                    rawDiff: diff,
                })
            }
        }
    }

    return Array.from(fileMap.values())
}

export function resolveSessionReviewDiffs(
    messages: ChatMessage[],
    sessionDiffEntries?: Array<Record<string, unknown>> | null,
): FileDiffInfo[] {
    const normalizedSessionDiffs = normalizeSessionDiffEntries(sessionDiffEntries)
    if (normalizedSessionDiffs.length > 0) {
        return normalizedSessionDiffs
    }
    return collectSessionDiffs(messages)
}
