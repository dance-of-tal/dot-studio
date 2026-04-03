import { useMemo, useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import './SessionRevertDock.css'

export interface SessionRevertDockItem {
    id: string
    text: string
}

interface SessionRevertDockProps {
    items: SessionRevertDockItem[]
    restoringId?: string | null
    disabled?: boolean
    onRestore: (id: string) => void
}

export function SessionRevertDock({
    items,
    restoringId = null,
    disabled = false,
    onRestore,
}: SessionRevertDockProps) {
    const itemSignature = `${items.length}:${items[0]?.id || ''}`
    const [expandedSignature, setExpandedSignature] = useState<string | null>(null)
    const collapsed = expandedSignature !== itemSignature

    const summary = useMemo(() => (
        items.length === 1
            ? '1 rolled back message'
            : `${items.length} rolled back messages`
    ), [items.length])

    const preview = items[0]?.text || ''

    if (items.length === 0) {
        return null
    }

    return (
        <div data-component="session-revert-dock">
            <button
                className="session-revert-dock__header"
                type="button"
                onClick={() => setExpandedSignature((current) => current === itemSignature ? null : itemSignature)}
            >
                <span className="session-revert-dock__summary">{summary}</span>
                {collapsed && preview ? (
                    <span className="session-revert-dock__preview">{preview}</span>
                ) : null}
                <span
                    className="session-revert-dock__chevron"
                    style={{ transform: `rotate(${collapsed ? 180 : 0}deg)` }}
                >
                    <ChevronDown size={14} />
                </span>
            </button>

            {collapsed ? (
                <div className="session-revert-dock__collapsed-spacer" aria-hidden="true" />
            ) : (
                <div className="session-revert-dock__body">
                    {items.map((item) => (
                        <div key={item.id} className="session-revert-dock__item">
                            <span className="session-revert-dock__text">{item.text}</span>
                            <button
                                type="button"
                                className="btn btn--sm"
                                disabled={disabled || restoringId === item.id}
                                onClick={() => onRestore(item.id)}
                            >
                                <RotateCcw size={11} />
                                <span>{restoringId === item.id ? 'Restoring…' : 'Restore'}</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
