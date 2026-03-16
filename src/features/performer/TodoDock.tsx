import { useState } from 'react';
import type { Todo } from '@opencode-ai/sdk/v2';
import { ListTodo, CheckCircle2, Circle, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface TodoDockProps {
    todos: Todo[];
}

export default function TodoDock({ todos }: TodoDockProps) {
    const [expanded, setExpanded] = useState(false);

    if (!todos || todos.length === 0) {
        return null;
    }

    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const inProgress = todos.filter(t => t.status === 'in_progress');
    const hasActive = inProgress.length > 0;

    const renderIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 size={14} style={{ color: 'var(--accent)' }} />;
            case 'in_progress': return <Loader2 size={14} className="spin" style={{ color: 'var(--accent)' }} />;
            case 'cancelled': return <XCircle size={14} style={{ color: 'var(--text-muted)' }} />;
            default: return <Circle size={14} style={{ color: 'var(--text-muted)' }} />;
        }
    };

    return (
        <div style={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            maxWidth: '90%',
            width: '400px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-strong)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Header (Summary Chip) */}
            <div 
                style={{ 
                    padding: '8px 12px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: expanded ? 'var(--bg-hover)' : 'transparent',
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <ListTodo size={14} style={{ color: 'var(--text-secondary)' }} />
                <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>Plan</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{completed} / {total}</span>
                    {hasActive && !expanded && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', maxWidth: '180px' }}>
                            <Loader2 size={12} className="spin" style={{ color: 'var(--accent)' }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
                                {inProgress[0].content}
                            </span>
                        </div>
                    )}
                </div>
                {expanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
            </div>

            {/* Expanded List */}
            {expanded && (
                <div style={{ 
                    borderTop: '1px solid var(--border-light)', 
                    maxHeight: '300px', 
                    overflowY: 'auto',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                }}>
                    {todos.map((todo, idx) => (
                        <div key={idx} style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            padding: '6px 8px',
                            borderRadius: '4px',
                            background: todo.status === 'in_progress' ? 'var(--bg-hover)' : 'transparent',
                            opacity: todo.status === 'pending' ? 0.6 : 1,
                        }}>
                            <div style={{ marginTop: '2px' }}>
                                {renderIcon(todo.status)}
                            </div>
                            <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                                <div style={{ textDecoration: todo.status === 'completed' || todo.status === 'cancelled' ? 'line-through' : 'none', color: todo.status === 'cancelled' ? 'var(--text-muted)' : 'inherit' }}>
                                    {todo.content}
                                </div>
                                {(todo as any).description && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {(todo as any).description}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
