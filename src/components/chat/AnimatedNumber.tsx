/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useMemo, type CSSProperties } from 'react'
import './AnimatedNumber.css'

const TRACK = Array.from({ length: 30 }, (_, i) => i % 10)
const DURATION = 600

function normalize(value: number): number {
    return ((value % 10) + 10) % 10
}

function spin(from: number, to: number, direction: 1 | -1): number {
    if (from === to) return 0
    if (direction > 0) return (to - from + 10) % 10
    return -((from - to + 10) % 10)
}

function Digit({ value, direction }: { value: number; direction: 1 | -1 }) {
    const [step, setStep] = useState(value + 10)
    const [animating, setAnimating] = useState(false)
    const lastRef = useRef(value)

    useEffect(() => {
        const last = lastRef.current
        const delta = spin(last, value, direction)
        lastRef.current = value

        if (!delta) {
            setAnimating(false)
            setStep(value + 10)
            return
        }

        setAnimating(true)
        setStep(prev => prev + delta)
    }, [value, direction])

    const handleTransitionEnd = () => {
        setAnimating(false)
        setStep(prev => normalize(prev) + 10)
    }

    return (
        <span data-slot="animated-number-digit">
            <span
                data-slot="animated-number-strip"
                data-animating={animating ? 'true' : 'false'}
                onTransitionEnd={handleTransitionEnd}
                style={{
                    '--animated-number-offset': `${step}`,
                    '--animated-number-duration': `${DURATION}ms`,
                } as CSSProperties}
            >
                {TRACK.map((v, i) => (
                    <span key={i} data-slot="animated-number-cell">{v}</span>
                ))}
            </span>
        </span>
    )
}

interface AnimatedNumberProps {
    value: number
    className?: string
}

/**
 * AnimatedNumber — odometer-style digit roller.
 *
 * Each digit scrolls independently through a 30-cell strip (0-9 × 3).
 * Digits are rendered right-to-left so additions flow naturally.
 * Width animates via CSS transition to accommodate digit count changes.
 *
 * Ported from OpenCode's SolidJS version.
 */
export function AnimatedNumber({ value: rawValue, className = '' }: AnimatedNumberProps) {
    const target = useMemo(() => {
        if (!Number.isFinite(rawValue)) return 0
        return Math.max(0, Math.round(rawValue))
    }, [rawValue])

    const [current, setCurrent] = useState(target)
    const [direction, setDirection] = useState<1 | -1>(1)

    useEffect(() => {
        if (target === current) return
        setDirection(target > current ? 1 : -1)
        setCurrent(target)
    }, [target, current])

    const digits = useMemo(() => {
        const str = current.toString()
        return Array.from(str, (char) => {
            const code = char.charCodeAt(0) - 48
            if (code < 0 || code > 9) return 0
            return code
        }).reverse()
    }, [current])

    const width = `${digits.length}ch`

    return (
        <span
            data-component="animated-number"
            className={className}
            aria-label={current.toString()}
        >
            <span
                data-slot="animated-number-value"
                style={{ '--animated-number-width': width } as CSSProperties}
            >
                {digits.map((digit, i) => (
                    <Digit key={i} value={digit} direction={direction} />
                ))}
            </span>
        </span>
    )
}
