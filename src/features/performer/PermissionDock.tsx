import { useMemo } from 'react';
import type { PermissionRequest } from '@opencode-ai/sdk/v2';
import { ShieldAlert } from 'lucide-react';
import './InteractionDock.css';

interface PermissionDockProps {
    request: PermissionRequest;
    onDecide: (response: 'once' | 'always' | 'reject') => void;
    responding: boolean;
}

export default function PermissionDock({ request, onDecide, responding }: PermissionDockProps) {
    const title = useMemo(() => {
        const parts = request.permission.split('.');
        if (parts.length > 0) {
            const raw = parts[parts.length - 1];
            return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
        }
        return 'Permission Required';
    }, [request.permission]);

    return (
        <div className="interaction-dock permission-dock">
            <div className="permission-dock__body">
                <ShieldAlert size={16} className="permission-dock__icon" />
                <div className="permission-dock__info">
                    <div className="permission-dock__title">{title}</div>
                    {request.patterns.length > 0 ? (
                        <div className="permission-dock__patterns">
                            {request.patterns.map((p, i) => (
                                <span key={i} className="permission-dock__pattern">{p}</span>
                            ))}
                        </div>
                    ) : (
                        <div className="permission-dock__fallback">
                            The AI is requesting permission to perform an action.
                        </div>
                    )}
                </div>
            </div>
            <div className="permission-dock__actions">
                <button
                    className="btn btn--sm"
                    onClick={() => onDecide('reject')}
                    disabled={responding}
                >
                    Deny
                </button>
                <button
                    className="btn btn--sm"
                    onClick={() => onDecide('once')}
                    disabled={responding}
                >
                    Allow Once
                </button>
                <button
                    className="btn btn--sm btn--primary"
                    onClick={() => onDecide('always')}
                    disabled={responding}
                >
                    Allow Always
                </button>
            </div>
        </div>
    );
}
