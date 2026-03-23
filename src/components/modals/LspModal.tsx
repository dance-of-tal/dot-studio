import { useEffect } from 'react';
import { useStudioStore } from '../../store';
import type { LspDiagnostic, LspServerInfo } from '../../types';
import { X, Activity, Server, AlertTriangle, AlertCircle } from 'lucide-react';
import './LspModal.css';

export default function LspModal({ open, onClose }: { open: boolean, onClose: () => void }) {
    const { lspServers, lspDiagnostics, fetchLspStatus } = useStudioStore();

    useEffect(() => {
        if (open) {
            fetchLspStatus();
        }
    }, [open, fetchLspStatus]);

    if (!open) return null;

    const allDiagnostics = Object.entries(lspDiagnostics).flatMap(([uri, diags]) =>
        diags.map((diagnostic: LspDiagnostic) => ({ ...diagnostic, uri }))
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal lsp-modal" onClick={e => e.stopPropagation()}>
                <div className="modal__header">
                    <h3><Activity size={14} className="icon-muted" style={{ marginRight: 6 }} /> Code Intelligence (LSP)</h3>
                    <button className="icon-btn" onClick={onClose}><X size={14} /></button>
                </div>
                <div className="modal__body">
                    <div className="lsp-section">
                        <h4>Active Language Servers</h4>
                        {lspServers.length === 0 ? (
                            <div className="empty-state">No language servers running.</div>
                        ) : (
                            <ul className="lsp-server-list">
                                {lspServers.map((server: LspServerInfo, i) => (
                                    <li key={i}>
                                        <div className="server-info">
                                            <Server size={12} className="icon-muted" />
                                            <span className="server-name">{server.name || server.id || 'Unknown Server'}</span>
                                        </div>
                                        <span className="server-status badge">{server.status || 'connected'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="lsp-section">
                        <h4>Diagnostics ({allDiagnostics.length})</h4>
                        {allDiagnostics.length === 0 ? (
                            <div className="empty-state">No stage errors found.</div>
                        ) : (
                            <div className="lsp-diagnostics-list">
                                {allDiagnostics.map((d, i) => (
                                    <div key={i} className={`diagnostic-item severity-${d.severity || 1}`}>
                                        <div className="diagnostic-header">
                                            {d.severity === 1 ? <AlertCircle size={12} color="#F24822" /> : <AlertTriangle size={12} color="#dbba00" />}
                                            <span className="diagnostic-file">{d.uri.split('/').pop()}</span>
                                            <span className="diagnostic-line">Line {d.range?.start?.line != null ? d.range.start.line + 1 : '?'}</span>
                                        </div>
                                        <div className="diagnostic-message">{d.message}</div>
                                        {d.source && <div className="diagnostic-source">[{d.source}]</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
