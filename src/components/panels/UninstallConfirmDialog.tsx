import { createPortal } from 'react-dom'
import { AlertTriangle, Hexagon, Users, Zap, X } from 'lucide-react'

type UninstallPlanItem = {
    urn?: string
    draftId?: string
    kind: string
    name: string
    source: string
    reason: string
}

type Props = {
    target: UninstallPlanItem
    dependents: UninstallPlanItem[]
    loading?: boolean
    actionName?: 'Uninstall' | 'Delete'
    onConfirm: () => void
    onCancel: () => void
}

function KindIcon({ kind }: { kind: string }) {
    switch (kind) {
        case 'tal': return <Hexagon size={12} />
        case 'dance': return <Zap size={12} />
        case 'performer': return <Users size={12} />
        case 'act': return <Zap size={12} />
        default: return null
    }
}

export default function UninstallConfirmDialog({ target, dependents, loading, actionName = 'Uninstall', onConfirm, onCancel }: Props) {
    const totalCount = 1 + dependents.length
    const actionIng = actionName === 'Uninstall' ? 'Uninstalling' : 'Deleting'

    return createPortal(
        <div className="modal-overlay" onClick={onCancel}>
            <div className="uninstall-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="uninstall-confirm-dialog__header">
                    <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
                    <span>{actionName} {totalCount} asset{totalCount > 1 ? 's' : ''}?</span>
                    <button className="icon-btn" onClick={onCancel} style={{ marginLeft: 'auto' }}>
                        <X size={14} />
                    </button>
                </div>

                <div className="uninstall-confirm-dialog__body">
                    <div className="uninstall-confirm-dialog__target">
                        <KindIcon kind={target.kind} />
                        <span className="uninstall-confirm-dialog__name">{target.name}</span>
                        <span className="uninstall-confirm-dialog__badge">{target.source}</span>
                    </div>

                    {dependents.length > 0 && (
                        <>
                            <div className="uninstall-confirm-dialog__warning">
                                The following assets depend on this and will also be {actionName.toLowerCase()}ed:
                            </div>
                            <ul className="uninstall-confirm-dialog__list">
                                {dependents.map((dep) => (
                                    <li key={dep.urn || dep.draftId} className="uninstall-confirm-dialog__item">
                                        <KindIcon kind={dep.kind} />
                                        <span className="uninstall-confirm-dialog__name">{dep.name}</span>
                                        <span className="uninstall-confirm-dialog__badge">{dep.source}</span>
                                        <span className="uninstall-confirm-dialog__reason">{dep.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    <div className="uninstall-confirm-dialog__note">
                        References to {totalCount > 1 ? 'these assets' : 'this asset'} in canvas performers and acts will also be removed.
                    </div>
                </div>

                <div className="uninstall-confirm-dialog__actions">
                    <button className="btn" onClick={onCancel} disabled={loading}>Cancel</button>
                    <button className="btn btn--danger" onClick={onConfirm} disabled={loading}>
                        {loading ? `${actionIng}…` : `${actionName} ${totalCount > 1 ? 'All' : ''}`}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
