import './DiffChanges.css'

interface DiffChangesProps {
    changes: { additions: number; deletions: number } | { additions: number; deletions: number }[]
    variant?: 'default' | 'bars'
    className?: string
}

/**
 * DiffChanges — visual diff summary.
 * 
 * `default` variant: shows "+N -M" text labels
 * `bars` variant: shows 5 colored blocks (green/red/neutral)
 *
 * Ported from OpenCode's diff-changes.tsx.
 */
export function DiffChanges({ changes, variant = 'default', className = '' }: DiffChangesProps) {
    const additions = Array.isArray(changes)
        ? changes.reduce((acc, diff) => acc + (diff.additions ?? 0), 0)
        : changes.additions
    const deletions = Array.isArray(changes)
        ? changes.reduce((acc, diff) => acc + (diff.deletions ?? 0), 0)
        : changes.deletions
    const total = additions + deletions

    if (variant === 'default' && total === 0) return null

    if (variant === 'bars') {
        const TOTAL_BLOCKS = 5
        const adds = additions ?? 0
        const dels = deletions ?? 0

        let added = 0, deleted = 0, neutral = TOTAL_BLOCKS

        if (adds > 0 || dels > 0) {
            const t = adds + dels
            if (t < 5) {
                added = adds > 0 ? 1 : 0
                deleted = dels > 0 ? 1 : 0
                neutral = TOTAL_BLOCKS - added - deleted
            } else {
                const pAdd = adds / t
                const pDel = dels / t
                let BLOCKS = TOTAL_BLOCKS
                if (t < 20 || (adds > dels ? adds / dels : dels / adds) < 4) {
                    BLOCKS = TOTAL_BLOCKS - 1
                }
                added = adds > 0 ? Math.max(1, Math.round(pAdd * BLOCKS)) : 0
                deleted = dels > 0 ? Math.max(1, Math.round(pDel * BLOCKS)) : 0
                if (adds > 0 && adds <= 5) added = Math.min(added, 1)
                if (adds > 5 && adds <= 10) added = Math.min(added, 2)
                if (dels > 0 && dels <= 5) deleted = Math.min(deleted, 1)
                if (dels > 5 && dels <= 10) deleted = Math.min(deleted, 2)
                let alloc = added + deleted
                if (alloc > BLOCKS) {
                    if (pAdd > pDel) added = BLOCKS - deleted
                    else deleted = BLOCKS - added
                    alloc = added + deleted
                }
                neutral = Math.max(0, TOTAL_BLOCKS - alloc)
            }
        }

        const blocks = [
            ...Array(added).fill('add'),
            ...Array(deleted).fill('del'),
            ...Array(neutral).fill('neutral'),
        ].slice(0, 5)

        return (
            <span className={`diff-changes diff-changes--bars ${className}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 14" fill="none" width={18} height={14}>
                    {blocks.map((type, i) => (
                        <rect key={i} x={i * 4} width={2} height={14} rx={1} className={`diff-bar--${type}`} />
                    ))}
                </svg>
            </span>
        )
    }

    return (
        <span className={`diff-changes ${className}`}>
            {additions > 0 && <span className="diff-changes__add">+{additions}</span>}
            {deletions > 0 && <span className="diff-changes__del">-{deletions}</span>}
        </span>
    )
}
