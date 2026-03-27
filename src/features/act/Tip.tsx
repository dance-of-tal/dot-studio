import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

/**
 * Tip — Tooltip that renders in a portal so it's never clipped
 * by overflow containers.
 */
export default function Tip({ text }: { text: string }) {
    const [visible, setVisible] = useState(false)
    const [pos, setPos] = useState({ top: 0, left: 0 })
    const ref = useRef<HTMLSpanElement>(null)

    const show = useCallback(() => {
        if (!ref.current) return
        const rect = ref.current.getBoundingClientRect()
        setPos({
            top: rect.bottom + 6,
            left: Math.max(8, rect.left + rect.width / 2 - 100),
        })
        setVisible(true)
    }, [])

    const hide = useCallback(() => setVisible(false), [])

    // Dismiss on scroll
    useEffect(() => {
        if (!visible) return
        const handler = () => setVisible(false)
        window.addEventListener('scroll', handler, true)
        return () => window.removeEventListener('scroll', handler, true)
    }, [visible])

    return (
        <>
            <span
                ref={ref}
                className="act-panel__tip-icon"
                onMouseEnter={show}
                onMouseLeave={hide}
            >
                <HelpCircle size={10} />
            </span>
            {visible && createPortal(
                <div
                    className="act-panel__tip-popup"
                    style={{ top: pos.top, left: pos.left }}
                >
                    {text}
                </div>,
                document.body,
            )}
        </>
    )
}
