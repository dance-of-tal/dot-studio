import { createPortal } from 'react-dom'
import { AlertTriangle, Check, RotateCcw, Shield, X } from 'lucide-react'
import type { SafeOwnerSummary } from '../../types'
import './PublishModal.css'
import './SafeReviewModal.css'

type SafeReviewModalProps = {
    title: string
    summary: SafeOwnerSummary | null
    busy?: boolean
    onClose: () => void
    onApply: () => void
    onDiscardAll: () => void
    onDiscardFile: (filePath: string) => void
    onUndoLastApply: () => void
}

export default function SafeReviewModal({
    title,
    summary,
    busy = false,
    onClose,
    onApply,
    onDiscardAll,
    onDiscardFile,
    onUndoLastApply,
}: SafeReviewModalProps) {
    const files = summary?.files || []

    return createPortal(
        <div className="publish-modal__backdrop" onClick={onClose}>
            <div className="publish-modal safe-review-modal" onClick={(event) => event.stopPropagation()}>
                <div className="publish-modal__header safe-review-modal__header">
                    <div className="safe-review-modal__title-wrap">
                        <Shield size={16} />
                        <div>
                            <h3>{title}</h3>
                            <p>
                                {summary
                                    ? `${summary.pendingCount} pending change${summary.pendingCount === 1 ? '' : 's'}`
                                    : 'Loading safe mode changes...'}
                                {summary && summary.conflictCount > 0 ? ` · ${summary.conflictCount} conflict${summary.conflictCount === 1 ? '' : 's'}` : ''}
                            </p>
                        </div>
                    </div>
                    <button className="icon-btn safe-review-modal__close" onClick={onClose} type="button">
                        <X size={16} />
                    </button>
                </div>

                <div className="publish-modal__body safe-review-modal__body">
                    <div className="safe-review-modal__summary">
                        {!summary ? 'Loading safe mode changes...' : `${summary.pendingCount} pending change${summary.pendingCount === 1 ? '' : 's'}`}
                        {summary && summary.conflictCount > 0 ? ` · ${summary.conflictCount} conflict${summary.conflictCount === 1 ? '' : 's'}` : ''}
                    </div>
                    {!summary ? (
                        <div className="publish-modal__empty">Loading changes...</div>
                    ) : files.length === 0 ? (
                        <div className="publish-modal__empty">No pending safe mode changes.</div>
                    ) : (
                        <div className="safe-review-modal__files">
                            {files.map((file) => (
                                <div key={file.path} className={`safe-review-modal__file ${file.conflict ? 'is-conflict' : ''}`}>
                                    <div className="safe-review-modal__file-header">
                                        <div className="safe-review-modal__file-meta">
                                            <strong>{file.path}</strong>
                                            <span className="canvas-frame__badge">{file.status}</span>
                                            {file.conflict ? (
                                                <span className="safe-review-modal__conflict">
                                                    <AlertTriangle size={12} />
                                                    <span>Conflict</span>
                                                </span>
                                            ) : null}
                                        </div>
                                        <button
                                            type="button"
                                            className="publish-modal__action"
                                            onClick={() => onDiscardFile(file.path)}
                                            disabled={busy}
                                        >
                                            Discard File
                                        </button>
                                    </div>
                                    <pre className="safe-review-modal__diff">{file.diff}</pre>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="publish-modal__footer">
                    <button
                        type="button"
                        className="publish-modal__action publish-modal__action--primary"
                        onClick={onApply}
                        disabled={busy || !summary || files.length === 0}
                    >
                        <Check size={12} />
                        <span>Apply</span>
                    </button>
                    <button
                        type="button"
                        className="publish-modal__action"
                        onClick={onDiscardAll}
                        disabled={busy || !summary || files.length === 0}
                    >
                        <RotateCcw size={12} />
                        <span>Discard All</span>
                    </button>
                    <button
                        type="button"
                        className="publish-modal__action"
                        onClick={onUndoLastApply}
                        disabled={busy || !summary?.canUndoLastApply}
                    >
                        <RotateCcw size={12} />
                        <span>Undo Last Apply</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
