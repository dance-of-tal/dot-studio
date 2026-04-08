import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStudioStore } from '../../store'
import { X, Code, Loader2 } from 'lucide-react'
import { SessionReview } from '../../features/chat/SessionReview'
import { normalizeSessionDiffEntries } from '../../features/chat/session-review-diffs'
import './DiffViewerModal.css'

export default function DiffViewerModal({ performerId, onClose }: { performerId: string, onClose: () => void }) {
    const { getDiff, performers } = useStudioStore()
    const [diffEntries, setDiffEntries] = useState<Array<Record<string, unknown>>>([])
    const [loading, setLoading] = useState(true)
    const performerName = performers.find(a => a.id === performerId)?.name || 'Performer'

    useEffect(() => {
        let active = true
        getDiff(performerId).then((data) => {
            if (active) {
                setDiffEntries(data || [])
                setLoading(false)
            }
        })
        return () => { active = false }
    }, [performerId, getDiff])

    const normalizedDiffs = useMemo(
        () => normalizeSessionDiffEntries(diffEntries),
        [diffEntries],
    )

    const modalContent = (
        <div className="diff-modal-overlay" onClick={onClose}>
            <div className="diff-modal-content" onClick={e => e.stopPropagation()}>
                <div className="diff-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Code size={16} />
                        <h3>{performerName} - Session Code Diffs</h3>
                    </div>
                    <button className="diff-modal-close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <div className="diff-modal-body">
                    {loading ? (
                        <div className="diff-loading">
                            <Loader2 size={24} className="spin-icon" />
                            <span>Loading diffs...</span>
                        </div>
                    ) : normalizedDiffs.length === 0 ? (
                        <div className="diff-empty">
                            No uncommitted code changes in this session.
                        </div>
                    ) : (
                        <SessionReview
                            messages={[]}
                            diffEntries={diffEntries}
                            className="diff-modal-review"
                        />
                    )}
                </div>
            </div>
        </div>
    )

    return createPortal(modalContent, document.body)
}
