import { useMemo } from 'react';
import type { PermissionRequest } from '@opencode-ai/sdk/v2';
import { ShieldAlert, Check, X } from 'lucide-react';
import './AgentInput.css';

interface PermissionDockProps {
    request: PermissionRequest;
    onDecide: (response: 'once' | 'always' | 'reject') => void;
    responding: boolean;
}

export default function PermissionDock({ request, onDecide, responding }: PermissionDockProps) {
    // Generate a human-readable title from the permission string
    const title = useMemo(() => {
        const parts = request.permission.split('.');
        if (parts.length > 0) {
            const raw = parts[parts.length - 1];
            return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
        }
        return 'Permission Required';
    }, [request.permission]);

    return (
        <div className="chat-input__warning">
            <div className="warning-content">
                <ShieldAlert size={16} className="warning-icon" />
                <div className="warning-text">
                    <strong>{title}</strong>
                    <div className="warning-description" style={{ marginTop: '4px', fontSize: '12px', opacity: 0.8 }}>
                        {request.patterns.length > 0 ? (
                            <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {request.patterns.map((p, i) => (
                                    <span key={i} style={{ background: 'var(--bg-tertiary)', padding: '2px 4px', borderRadius: '4px', marginRight: '4px' }}>
                                        {p}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            'The AI is requesting permission to perform an action.'
                        )}
                    </div>
                </div>
            </div>
            <div className="warning-actions" style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                    className="warning-action-btn reject"
                    onClick={() => onDecide('reject')}
                    disabled={responding}
                    style={{ background: 'transparent', color: 'var(--text-secondary)' }}
                >
                    <X size={12} style={{ marginRight: '4px' }} />
                    Deny
                </button>
                <button
                    className="warning-action-btn once"
                    onClick={() => onDecide('once')}
                    disabled={responding}
                >
                    <Check size={12} style={{ marginRight: '4px' }} />
                    Allow Once
                </button>
                <button
                    className="warning-action-btn always"
                    onClick={() => onDecide('always')}
                    disabled={responding}
                    style={{ background: 'var(--accent-color)', color: 'white' }}
                >
                    <Check size={12} style={{ marginRight: '4px' }} />
                    Allow Always
                </button>
            </div>
        </div>
    );
}
