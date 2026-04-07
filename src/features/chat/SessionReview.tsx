/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react'
import { FileEdit } from 'lucide-react'
import type { ChatMessage } from '../../types'
import { DiffChanges } from '../../components/chat/DiffChanges'
import { DiffBlock } from '../../components/chat/SyntaxBlock'
import './SessionReview.css'

/* ═══════════════════════════════════════════
   Diff data collection from messages
   ═══════════════════════════════════════════ */

export interface FileDiffInfo {
    file: string
    before: string
    after: string
    additions: number
    deletions: number
    status: 'added' | 'modified' | 'deleted'
    /** Raw unified diff if available (from apply_patch) */
    rawDiff?: string
}

const EDIT_NAMES = new Set(['replace_in_file', 'multi_replace_file_content', 'str_replace_editor', 'replace_file_content', 'edit'])
const WRITE_NAMES = new Set(['write_to_file', 'create_file', 'write'])
const PATCH_NAMES = new Set(['apply_patch'])

function extractPath(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.path || input.TargetFile || input.file || input.filePath || input.AbsolutePath || '')
}

function getFilename(path: string): string {
    if (!path) return ''
    return path.split('/').pop() || path
}

function getDirectory(path: string): string {
    if (!path.includes('/')) return ''
    const parts = path.split('/')
    return parts.slice(0, -1).join('/') + '/'
}

/**
 * Collect file diffs from chat messages by scanning tool parts.
 * Groups edits per file and computes cumulative before/after.
 */
export function collectSessionDiffs(messages: ChatMessage[]): FileDiffInfo[] {
    const fileMap = new Map<string, FileDiffInfo>()

    for (const msg of messages) {
        if (!msg.parts) continue
        for (const part of msg.parts) {
            if (part.type !== 'tool' || !part.tool) continue
            const tool = part.tool
            if (tool.status === 'error') continue

            const filePath = extractPath(tool.input)
            if (!filePath) continue

            if (EDIT_NAMES.has(tool.name)) {
                const oldStr = String(tool.input?.old_string || tool.input?.oldString || tool.input?.TargetContent || '')
                const newStr = String(tool.input?.new_string || tool.input?.newString || tool.input?.ReplacementContent || '')
                if (oldStr || newStr) {
                    const existing = fileMap.get(filePath)
                    if (existing) {
                        existing.after = (existing.after || '').replace(oldStr, newStr)
                        existing.additions += newStr.split('\n').length
                        existing.deletions += oldStr.split('\n').length
                        existing.status = 'modified'
                    } else {
                        fileMap.set(filePath, {
                            file: filePath,
                            before: oldStr,
                            after: newStr,
                            additions: newStr.split('\n').length,
                            deletions: oldStr.split('\n').length,
                            status: 'modified',
                        })
                    }
                }
            } else if (WRITE_NAMES.has(tool.name)) {
                const content = String(tool.input?.content || tool.input?.CodeContent || '')
                fileMap.set(filePath, {
                    file: filePath,
                    before: '',
                    after: content,
                    additions: content ? content.split('\n').length : 0,
                    deletions: 0,
                    status: 'added',
                })
            } else if (PATCH_NAMES.has(tool.name)) {
                const diff = String(tool.input?.diff || tool.input?.patch || tool.input?.content || '')
                if (diff) {
                    const existing = fileMap.get(filePath)
                    if (existing) {
                        existing.rawDiff = diff
                    } else {
                        // Count +/- lines
                        const lines = diff.split('\n')
                        const adds = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
                        const dels = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length
                        fileMap.set(filePath, {
                            file: filePath,
                            before: '',
                            after: '',
                            additions: adds,
                            deletions: dels,
                            status: 'modified',
                            rawDiff: diff,
                        })
                    }
                }
            }
        }
    }

    return Array.from(fileMap.values())
}

/* ═══════════════════════════════════════════
   SessionReview Component
   ═══════════════════════════════════════════ */

function FileDiffItem({ diff }: { diff: FileDiffInfo }) {
    const filename = getFilename(diff.file)
    const directory = getDirectory(diff.file)

    const statusBadge = diff.status === 'added'
        ? <span className="session-review__badge session-review__badge--added">added</span>
        : diff.status === 'deleted'
        ? <span className="session-review__badge session-review__badge--deleted">deleted</span>
        : null

    return (
        <section className="session-review__file">
            <div className="session-review__file-header">
                <span className="session-review__file-icon">
                    <FileEdit size={12} />
                </span>
                <span className="session-review__file-info">
                    <span className="session-review__filename">{filename}</span>
                    {directory && (
                        <span className="session-review__directory">{directory}</span>
                    )}
                </span>
                <span className="session-review__file-actions">
                    {statusBadge}
                    {(diff.additions > 0 || diff.deletions > 0) && (
                        <DiffChanges changes={diff} />
                    )}
                </span>
            </div>
            <div className="session-review__file-content">
                {diff.rawDiff ? (
                    <DiffBlock before="" after="" rawDiff={diff.rawDiff} filename={filename} maxHeight={500} />
                ) : (diff.before || diff.after) ? (
                    <DiffBlock before={diff.before} after={diff.after} filename={filename} maxHeight={500} />
                ) : (
                    <div className="session-review__empty-diff">No content available</div>
                )}
            </div>
        </section>
    )
}

export interface SessionReviewProps {
    messages: ChatMessage[]
    className?: string
}

/**
 * SessionReview — diff review panel showing all file changes in the session.
 *
 * Scans chat messages for edit/write/patch tool parts and displays
 * per-file diffs inline so opening the panel immediately reveals changes.
 */
export function SessionReview({ messages, className = '' }: SessionReviewProps) {
    const diffs = useMemo(() => collectSessionDiffs(messages), [messages])

    const totalAdditions = useMemo(() => diffs.reduce((s, d) => s + d.additions, 0), [diffs])
    const totalDeletions = useMemo(() => diffs.reduce((s, d) => s + d.deletions, 0), [diffs])

    if (diffs.length === 0) return null

    return (
        <div className={`session-review ${className}`}>
            <div className="session-review__header">
                <span className="session-review__title">
                    Changes
                    <span className="session-review__count">{diffs.length} file{diffs.length !== 1 ? 's' : ''}</span>
                </span>
                <span className="session-review__summary">
                    <DiffChanges changes={{ additions: totalAdditions, deletions: totalDeletions }} />
                </span>
            </div>
            <div className="session-review__files">
                {diffs.map((diff, idx) => (
                    <FileDiffItem key={diff.file || idx} diff={diff} />
                ))}
            </div>
        </div>
    )
}
