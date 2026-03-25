import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, CheckCircle2, Circle, XCircle } from 'lucide-react'
import type { Todo } from '@opencode-ai/sdk/v2'
import { AnimatedNumber } from './AnimatedNumber'
import { TextStrikethrough } from './TextStrikethrough'
import './TodoDock.css'

function PulsingDot() {
    return (
        <svg viewBox="0 0 12 12" width={12} height={12} fill="currentColor" className="todo-dock-pulse">
            <circle cx="6" cy="6" r="3" />
        </svg>
    )
}

function TodoCheckIcon({ status }: { status: string }) {
    if (status === 'completed') return <CheckCircle2 size={14} style={{ color: '#10b981' }} />
    if (status === 'in_progress') return <PulsingDot />
    if (status === 'cancelled') return <XCircle size={14} style={{ color: 'var(--text-muted)' }} />
    return <Circle size={14} style={{ color: 'var(--text-muted)' }} />
}

interface TodoDockProps {
    todos: Todo[]
}

/**
 * TodoDock — collapsible todo progress panel above the composer.
 *
 * Header: done/total with AnimatedNumber + active todo preview (collapsed)
 * Body: scrollable list with Checkbox + TextStrikethrough per item
 * Auto-scrolls to the current in_progress item.
 *
 * Ported from OpenCode's SessionTodoDock.
 */
export function TodoDock({ todos }: TodoDockProps) {
    const [collapsed, setCollapsed] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [stuck, setStuck] = useState(false)

    const total = todos.length
    const done = useMemo(() => todos.filter(t => t.status === 'completed').length, [todos])

    const active = useMemo(() =>
        todos.find(t => t.status === 'in_progress')
        ?? todos.find(t => t.status === 'pending')
        ?? todos.filter(t => t.status === 'completed').at(-1)
        ?? todos[0]
    , [todos])

    const preview = active?.content ?? ''

    // Auto-scroll to in_progress item
    const inProgressIdx = useMemo(() => todos.findIndex(t => t.status === 'in_progress'), [todos])

    useEffect(() => {
        if (collapsed || inProgressIdx < 0) return
        const el = scrollRef.current
        if (!el) return

        requestAnimationFrame(() => {
            const target = el.querySelector('[data-in-progress]')
            if (!(target instanceof HTMLElement)) return

            const topFade = 16
            const bottomFade = 44
            const rect = target.getBoundingClientRect()
            const containerRect = el.getBoundingClientRect()
            const top = rect.top - containerRect.top + el.scrollTop
            const bottom = rect.bottom - containerRect.top + el.scrollTop
            const viewTop = el.scrollTop + topFade
            const viewBottom = el.scrollTop + el.clientHeight - bottomFade

            if (top < viewTop) {
                el.scrollTop = Math.max(0, top - topFade)
            } else if (bottom > viewBottom) {
                el.scrollTop = bottom - (el.clientHeight - bottomFade)
            }
        })
    }, [collapsed, inProgressIdx])

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setStuck(e.currentTarget.scrollTop > 0)
    }, [])

    if (todos.length === 0) return null

    return (
        <div data-component="todo-dock" data-collapsed={collapsed ? 'true' : 'false'}>
            {/* Header — always visible */}
            <button
                className="todo-dock__header"
                onClick={() => setCollapsed(c => !c)}
                type="button"
            >
                <span className="todo-dock__progress">
                    <AnimatedNumber value={done} />
                    <span className="todo-dock__slash">/</span>
                    <AnimatedNumber value={total} />
                </span>
                {collapsed && preview && (
                    <span className="todo-dock__preview">{preview}</span>
                )}
                <span
                    className="todo-dock__chevron"
                    style={{ transform: `rotate(${collapsed ? 180 : 0}deg)` }}
                >
                    <ChevronDown size={14} />
                </span>
            </button>

            {/* Body — collapsible */}
            {!collapsed && (
                <div className="todo-dock__body-wrapper">
                    <div
                        ref={scrollRef}
                        className="todo-dock__body"
                        onScroll={handleScroll}
                    >
                        {todos.map((todo, i) => (
                            <div
                                key={i}
                                className="todo-dock__item"
                                data-state={todo.status}
                                data-in-progress={todo.status === 'in_progress' ? '' : undefined}
                            >
                                <span className="todo-dock__check">
                                    <TodoCheckIcon status={todo.status} />
                                </span>
                                <TextStrikethrough
                                    active={todo.status === 'completed' || todo.status === 'cancelled'}
                                    text={todo.content}
                                    className="todo-dock__text"
                                />
                            </div>
                        ))}
                    </div>
                    {/* Top fade when scrolled */}
                    <div
                        className="todo-dock__top-fade"
                        style={{ opacity: stuck ? 1 : 0 }}
                    />
                </div>
            )}
        </div>
    )
}
