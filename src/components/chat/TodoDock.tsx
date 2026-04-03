import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Todo } from '@opencode-ai/sdk/v2'
import { AnimatedNumber } from './AnimatedNumber'
import './TodoDock.css'

/* ── Icon SVGs ── */

function TodoIcon({ status }: { status: string }) {
    if (status === 'completed') {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="todo-dock-icon todo-dock-icon--done">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
                <path d="M4.5 7.2L6.2 8.8L9.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    }
    if (status === 'in_progress') {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="todo-dock-icon todo-dock-icon--active">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="todo-dock-icon__ring" />
                <circle cx="7" cy="7" r="2.5" fill="currentColor" />
            </svg>
        )
    }
    if (status === 'cancelled') {
        return (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="todo-dock-icon todo-dock-icon--cancelled">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 5L9 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        )
    }
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="todo-dock-icon todo-dock-icon--pending">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    )
}

/* ── Lifecycle state machine (matches OpenCode's todoState) ── */

type DockVisibility = 'hide' | 'clear' | 'open' | 'close'

function computeDockState(count: number, allDone: boolean, isLive: boolean): DockVisibility {
    if (count === 0) return 'hide'
    if (!isLive) return 'clear'    // session idle → clear stale todos
    if (!allDone) return 'open'    // still in progress → show
    return 'close'                 // all done → auto-close after delay
}

/* ── Main component ── */

interface TodoDockProps {
    todos: Todo[]
    /** Whether the session is currently active (busy/streaming). Dock auto-clears on idle. */
    isLive?: boolean
    /** Called when the dock wants to clear stale todos from the store */
    onClear?: () => void
}

const CLOSE_DELAY_MS = 400

/**
 * TodoDock — collapsible todo progress panel above the composer.
 *
 * Lifecycle (mirrors OpenCode behavior):
 *   - `count=0` → hidden
 *   - `!isLive` (session idle) → stale todos cleared via `onClear` callback
 *   - `!allDone` → auto-open
 *   - `allDone` → auto-close after 400ms delay
 */
export function TodoDock({ todos, isLive = false, onClear }: TodoDockProps) {
    const [dockVisible, setDockVisible] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [stuck, setStuck] = useState(false)
    const closeTimerRef = useRef<number | undefined>(undefined)

    const total = todos.length
    const done = useMemo(() => todos.filter(t => t.status === 'completed').length, [todos])
    const allDone = useMemo(
        () => total > 0 && todos.every(t => t.status === 'completed' || t.status === 'cancelled'),
        [todos, total],
    )

    // Lifecycle state machine
    const visibility = computeDockState(total, allDone, isLive)
    const scheduleDockUpdate = useCallback((callback: () => void) => {
        queueMicrotask(callback)
    }, [])

    useEffect(() => {
        // Clear any pending timer
        if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current)
            closeTimerRef.current = undefined
        }

        switch (visibility) {
            case 'hide':
                scheduleDockUpdate(() => {
                    setDockVisible(false)
                })
                break
            case 'clear':
                scheduleDockUpdate(() => {
                    setDockVisible(false)
                })
                onClear?.()
                break
            case 'open':
                scheduleDockUpdate(() => {
                    setDockVisible(true)
                    setCollapsed(false)
                })
                break
            case 'close':
                // All done → close after delay
                closeTimerRef.current = window.setTimeout(() => {
                    setDockVisible(false)
                    closeTimerRef.current = undefined
                }, CLOSE_DELAY_MS)
                break
        }

        return () => {
            if (closeTimerRef.current) {
                window.clearTimeout(closeTimerRef.current)
            }
        }
    }, [visibility, onClear, scheduleDockUpdate])

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

    if (!dockVisible || todos.length === 0) return null

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
                                className={`todo-dock__item ${todo.status === 'in_progress' ? 'todo-dock__item--active' : ''} ${todo.status === 'completed' || todo.status === 'cancelled' ? 'todo-dock__item--done' : ''}`}
                                data-state={todo.status}
                                data-in-progress={todo.status === 'in_progress' ? '' : undefined}
                            >
                                <span className="todo-dock__check">
                                    <TodoIcon status={todo.status} />
                                </span>
                                <span className="todo-dock__text">{todo.content}</span>
                            </div>
                        ))}
                    </div>
                    <div
                        className="todo-dock__top-fade"
                        style={{ opacity: stuck ? 1 : 0 }}
                    />
                </div>
            )}
        </div>
    )
}
