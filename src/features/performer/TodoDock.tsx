import { useState } from 'react';
import type { Todo } from '@opencode-ai/sdk/v2';
import { ListTodo, CheckCircle2, Circle, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import './InteractionDock.css';

interface TodoDockProps {
    todos: Todo[];
}

export default function TodoDock({ todos }: TodoDockProps) {
    const [expanded, setExpanded] = useState(false);

    if (!todos || todos.length === 0) return null;

    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const inProgress = todos.filter(t => t.status === 'in_progress');
    const hasActive = inProgress.length > 0;

    const renderIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 size={14} style={{ color: 'var(--accent)' }} />;
            case 'in_progress': return <Loader2 size={14} className="dock-spin" style={{ color: 'var(--accent)' }} />;
            case 'cancelled': return <XCircle size={14} style={{ color: 'var(--text-muted)' }} />;
            default: return <Circle size={14} style={{ color: 'var(--text-muted)' }} />;
        }
    };

    return (
        <div className="interaction-dock todo-dock">
            <div className="todo-dock__header" onClick={() => setExpanded(!expanded)}>
                <ListTodo size={14} className="todo-dock__header-icon" />
                <div className="todo-dock__summary">
                    <strong>Plan</strong>
                    <span className="todo-dock__counter">{completed} / {total}</span>
                    {hasActive && !expanded && (
                        <div className="todo-dock__active-preview">
                            <Loader2 size={12} className="dock-spin" style={{ color: 'var(--accent)' }} />
                            <span className="todo-dock__active-label">{inProgress[0].content}</span>
                        </div>
                    )}
                </div>
                {expanded
                    ? <ChevronDown size={14} className="todo-dock__chevron" />
                    : <ChevronRight size={14} className="todo-dock__chevron" />
                }
            </div>

            {expanded && (
                <div className="todo-dock__list">
                    {todos.map((todo, idx) => (
                        <div
                            key={idx}
                            className={[
                                'todo-dock__item',
                                todo.status === 'in_progress' ? 'todo-dock__item--active' : '',
                                todo.status === 'pending' ? 'todo-dock__item--pending' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            <div className="todo-dock__item-icon">
                                {renderIcon(todo.status)}
                            </div>
                            <div className="todo-dock__item-content">
                                <div className={
                                    todo.status === 'completed' ? 'todo-dock__item-text--done' :
                                    todo.status === 'cancelled' ? 'todo-dock__item-text--cancelled' : ''
                                }>
                                    {todo.content}
                                </div>
                                {(todo as any).description && (
                                    <div className="todo-dock__item-desc">{(todo as any).description}</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
