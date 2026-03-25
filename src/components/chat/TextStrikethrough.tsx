import { useRef, useEffect, useState, type CSSProperties } from 'react'
import './TextStrikethrough.css'

interface TextStrikethroughProps {
    /** Whether the strikethrough line is drawn */
    active: boolean
    /** The text to display */
    text: string
    /** Transition duration in ms */
    duration?: number
    className?: string
    style?: CSSProperties
}

/**
 * TextStrikethrough — animated line-through from left to right.
 *
 * Uses `clip-path` on a grid-stacked overlay that carries
 * `text-decoration: line-through`. The overlay's text paint is hidden
 * via `-webkit-text-fill-color: transparent`, keeping only the line.
 *
 * Ported from OpenCode's SolidJS spring version → CSS transition.
 */
export function TextStrikethrough({
    active,
    text,
    duration = 350,
    className = '',
    style,
}: TextStrikethroughProps) {
    const baseRef = useRef<HTMLSpanElement>(null)
    const [textWidth, setTextWidth] = useState(0)

    useEffect(() => {
        const el = baseRef.current
        if (!el) return
        const measure = () => setTextWidth(el.scrollWidth)
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [text])

    // Overlay clip: reveal from left to right
    const overlayClip = active
        ? 'inset(0 0 0 0)'
        : `inset(0 ${textWidth > 0 ? `${textWidth}px` : '100%'} 0 0)`

    // Base clip: hide the portion already struck through
    const baseClip = active && textWidth > 0
        ? `inset(0 0 0 ${textWidth}px)`
        : 'none'

    const vars = {
        '--strikethrough-duration': `${duration}ms`,
    } as CSSProperties

    return (
        <span
            data-component="text-strikethrough"
            className={className}
            style={{ ...vars, ...style }}
        >
            <span
                ref={baseRef}
                data-slot="text-strikethrough-base"
                style={{ clipPath: baseClip }}
            >
                {text}
            </span>
            <span
                data-slot="text-strikethrough-line"
                aria-hidden="true"
                style={{ clipPath: overlayClip }}
            >
                {text}
            </span>
        </span>
    )
}
