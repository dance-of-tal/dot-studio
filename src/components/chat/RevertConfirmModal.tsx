/**
 * RevertConfirmModal — Confirmation dialog before reverting to a message.
 * Warns that revert is irreversible and that later file changes may also
 * be rolled back by the session runtime.
 */
import { createPortal } from 'react-dom'
import { AlertTriangle, CornerDownLeft, X } from 'lucide-react'
import '../modals/PublishModal.css'
import './RevertConfirmModal.css'

type RevertConfirmModalProps = {
    messagePreview: string
    onConfirm: () => void
    onCancel: () => void
}

export default function RevertConfirmModal({
    messagePreview,
    onConfirm,
    onCancel,
}: RevertConfirmModalProps) {
    const truncated = messagePreview.length > 120
        ? messagePreview.slice(0, 120) + '…'
        : messagePreview

    return createPortal(
        <div className="publish-modal__backdrop" onClick={onCancel}>
            <div className="publish-modal revert-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="publish-modal__header revert-confirm-modal__header">
                    <div className="revert-confirm-modal__title-wrap">
                        <CornerDownLeft size={16} />
                        <h3>Revert to this message?</h3>
                    </div>
                    <button className="icon-btn" onClick={onCancel} type="button">
                        <X size={16} />
                    </button>
                </div>

                <div className="publish-modal__body revert-confirm-modal__body">
                    <div className="revert-confirm-modal__preview">
                        <span className="revert-confirm-modal__preview-label">Revert to:</span>
                        <span className="revert-confirm-modal__preview-text">{truncated}</span>
                    </div>

                    <div className="revert-confirm-modal__warning">
                        <AlertTriangle size={14} />
                        <span>All messages after this point will be permanently deleted. This action cannot be undone.</span>
                    </div>

                    <div className="revert-confirm-modal__note">
                        Studio will also ask the session runtime to roll back file changes made after this message when that history is reversible.
                    </div>
                </div>

                <div className="publish-modal__footer">
                    <button
                        type="button"
                        className="publish-modal__action"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="publish-modal__action publish-modal__action--destructive"
                        onClick={onConfirm}
                    >
                        <CornerDownLeft size={12} />
                        <span>Revert</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
