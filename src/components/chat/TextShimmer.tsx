/* eslint-disable react-hooks/set-state-in-effect */
import { useRef, useEffect, useState, type CSSProperties } from 'react'
import './TextShimmer.css'

interface TextShimmerProps {
    /** The text to display */
    text: string
    /** Whether the shimmer animation is active */
    active?: boolean
    /** Custom class name */
    className?: string
    /** Stagger offset index for multiple shimmers */
    offset?: number
}

/**
 * TextShimmer — gradient sweep animation on text.
 * 
 * When active, shows a shimmering gradient sweeping across the text.
 * When inactive, smoothly transitions back to base text color.
 * 
 * Ported from OpenCode's SolidJS TextShimmer component.
 */
export function TextShimmer({
    text,
    active = true,
    className,
    offset = 0,
}: TextShimmerProps) {
    const SWAP_MS = 220
    const [run, setRun] = useState(active)
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => {
        if (timerRef.current !== undefined) {
            clearTimeout(timerRef.current)
            timerRef.current = undefined
        }

        if (active) {
            setRun(true)
            return
        }

        // Delay deactivation to let the animation finish
        timerRef.current = setTimeout(() => {
            timerRef.current = undefined
            setRun(false)
        }, SWAP_MS)

        return () => {
            if (timerRef.current !== undefined) clearTimeout(timerRef.current)
        }
    }, [active])

    const style: CSSProperties = {
        '--text-shimmer-swap': `${SWAP_MS}ms`,
        '--text-shimmer-index': `${offset}`,
    } as CSSProperties

    return (
        <span
            data-component="text-shimmer"
            data-active={active ? 'true' : 'false'}
            className={className}
            aria-label={text}
            style={style}
        >
            <span data-slot="text-shimmer-char">
                <span data-slot="text-shimmer-char-base" aria-hidden="true">
                    {text}
                </span>
                <span
                    data-slot="text-shimmer-char-shimmer"
                    data-run={run ? 'true' : 'false'}
                    aria-hidden="true"
                >
                    {text}
                </span>
            </span>
        </span>
    )
}
