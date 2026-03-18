import { useState, useRef, useEffect, useCallback, createContext, useContext, type ReactNode, type ReactElement } from 'react'
import './DropdownMenu.css'

// ── Context ─────────────────────────────────────────────

interface DropdownCtx {
    close: () => void
}

const Ctx = createContext<DropdownCtx>({ close: () => {} })

// ── Types ───────────────────────────────────────────────

export type DropdownMenuItem =
    | { label: string; onClick: () => void; variant?: 'danger'; active?: boolean; disabled?: boolean }
    | 'separator'

type DropdownMenuProps = {
    /** The trigger element (button, icon-btn, etc.) */
    trigger: ReactElement
    /** Menu alignment relative to trigger  */
    align?: 'left' | 'right'
    /** Shortcut: flat list of items (mutually exclusive with children) */
    items?: DropdownMenuItem[]
    /** Custom menu content (use DropdownMenu.Group / DropdownMenu.Item) */
    children?: ReactNode
    /** Controlled open state (optional — internal state used if omitted) */
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** Additional className on the wrapper */
    className?: string
}

// ── Main Component ──────────────────────────────────────

export function DropdownMenu({
    trigger,
    align = 'left',
    items,
    children,
    open: controlledOpen,
    onOpenChange,
    className,
}: DropdownMenuProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined
    const isOpen = isControlled ? controlledOpen : internalOpen

    const wrapperRef = useRef<HTMLDivElement>(null)

    const setOpen = useCallback((next: boolean) => {
        if (isControlled) {
            onOpenChange?.(next)
        } else {
            setInternalOpen(next)
        }
    }, [isControlled, onOpenChange])

    const toggle = useCallback(() => setOpen(!isOpen), [setOpen, isOpen])
    const close = useCallback(() => setOpen(false), [setOpen])

    // Click-outside
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                close()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [isOpen, close])

    // ESC key
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [isOpen, close])

    // Build menu content
    let menuContent: ReactNode = null
    if (items) {
        menuContent = items.map((item, i) => {
            if (item === 'separator') {
                return <div key={`sep-${i}`} className="dropdown-menu__separator" />
            }
            return (
                <button
                    key={item.label}
                    className={[
                        'dropdown-menu__item',
                        item.variant === 'danger' && 'dropdown-menu__item--danger',
                        item.active && 'is-active',
                    ].filter(Boolean).join(' ')}
                    disabled={item.disabled}
                    onClick={() => {
                        item.onClick()
                        close()
                    }}
                >
                    {item.label}
                </button>
            )
        })
    } else if (children) {
        menuContent = children
    }

    return (
        <Ctx.Provider value={{ close }}>
            <div ref={wrapperRef} className={`dropdown-menu ${className || ''}`}>
                <div className="dropdown-menu__trigger" onClick={toggle}>
                    {trigger}
                </div>
                {isOpen && menuContent && (
                    <div className={`dropdown-menu__panel ${align === 'right' ? 'dropdown-menu__panel--right' : ''}`}>
                        {menuContent}
                    </div>
                )}
            </div>
        </Ctx.Provider>
    )
}

// ── Compound: Group ─────────────────────────────────────

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="dropdown-menu__group">
            <div className="dropdown-menu__group-label">{label}</div>
            {children}
        </div>
    )
}

// ── Compound: Item ──────────────────────────────────────

function MenuItem({
    children,
    onClick,
    active,
    variant,
    disabled,
}: {
    children: ReactNode
    onClick?: () => void
    active?: boolean
    variant?: 'danger'
    disabled?: boolean
}) {
    const { close } = useContext(Ctx)
    return (
        <button
            className={[
                'dropdown-menu__item',
                variant === 'danger' && 'dropdown-menu__item--danger',
                active && 'is-active',
            ].filter(Boolean).join(' ')}
            disabled={disabled}
            onClick={() => {
                onClick?.()
                close()
            }}
        >
            {children}
        </button>
    )
}

// ── Attach compounds ────────────────────────────────────

DropdownMenu.Group = MenuGroup
DropdownMenu.Item = MenuItem
