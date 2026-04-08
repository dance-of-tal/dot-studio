/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react'
import { FileEdit } from 'lucide-react'
import type { ChatMessage } from '../../types'
import { DiffChanges } from '../../components/chat/DiffChanges'
import { DiffBlock } from '../../components/chat/SyntaxBlock'
import {
    resolveSessionReviewDiffs,
    type FileDiffInfo,
} from './session-review-diffs'
import './SessionReview.css'

function getFilename(path: string): string {
    if (!path) return ''
    return path.split('/').pop() || path
}

function getDirectory(path: string): string {
    if (!path.includes('/')) return ''
    const parts = path.split('/')
    return parts.slice(0, -1).join('/') + '/'
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
    diffEntries?: Array<Record<string, unknown>> | null
    className?: string
}

/**
 * SessionReview — diff review panel showing all file changes in the session.
 *
 * Scans chat messages for edit/write/patch tool parts and displays
 * per-file diffs inline so opening the panel immediately reveals changes.
 */
export function SessionReview({ messages, diffEntries, className = '' }: SessionReviewProps) {
    const diffs = useMemo(
        () => resolveSessionReviewDiffs(messages, diffEntries),
        [diffEntries, messages],
    )

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
