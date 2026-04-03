import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowRight, Server, Users, X } from 'lucide-react'
import type { McpCatalogImpact } from './mcp-catalog-utils'

type Props = {
    impact: McpCatalogImpact
    loading?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export default function McpCatalogImpactDialog({
    impact,
    loading,
    onConfirm,
    onCancel,
}: Props) {
    const changeCount = impact.renames.length + impact.deletes.length
    const performerCount = impact.affectedPerformerIds.length

    return createPortal(
        <div className="modal-overlay" onClick={onCancel}>
            <div className="mcp-impact-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="mcp-impact-dialog__header">
                    <AlertTriangle size={16} style={{ color: 'var(--status-warning)' }} />
                    <span>Update performer MCP references?</span>
                    <button type="button" className="icon-btn" onClick={onCancel} style={{ marginLeft: 'auto' }}>
                        <X size={14} />
                    </button>
                </div>

                <div className="mcp-impact-dialog__body">
                    <div className="mcp-impact-dialog__summary">
                        Saving this MCP catalog change will update {performerCount} performer{performerCount === 1 ? '' : 's'}.
                    </div>

                    {impact.renames.length > 0 ? (
                        <div className="mcp-impact-dialog__section">
                            <div className="mcp-impact-dialog__section-title">
                                <Server size={12} />
                                Renames
                            </div>
                            <ul className="mcp-impact-dialog__list">
                                {impact.renames.map((rename) => (
                                    <li key={rename.key} className="mcp-impact-dialog__item">
                                        <span>{rename.previousName}</span>
                                        <ArrowRight size={12} />
                                        <span>{rename.nextName}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {impact.deletes.length > 0 ? (
                        <div className="mcp-impact-dialog__section">
                            <div className="mcp-impact-dialog__section-title">
                                <Server size={12} />
                                Deletes
                            </div>
                            <ul className="mcp-impact-dialog__list">
                                {impact.deletes.map((item) => (
                                    <li key={item.key} className="mcp-impact-dialog__item">
                                        <span>{item.name}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="mcp-impact-dialog__section">
                        <div className="mcp-impact-dialog__section-title">
                            <Users size={12} />
                            Affected performers
                        </div>
                        <ul className="mcp-impact-dialog__list">
                            {impact.affectedPerformerNames.map((name) => (
                                <li key={name} className="mcp-impact-dialog__item">
                                    <span>{name}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="mcp-impact-dialog__note">
                        Studio will rewrite performer MCP selections and bindings to match this saved catalog.
                    </div>
                </div>

                <div className="mcp-impact-dialog__actions">
                    <button type="button" className="btn" onClick={onCancel} disabled={loading}>Cancel</button>
                    <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={loading}>
                        {loading ? 'Saving…' : `Save ${changeCount > 1 ? 'Changes' : 'Change'}`}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
