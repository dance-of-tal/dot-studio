import { useRef, useCallback, useEffect, useState } from 'react'

export interface UseAutoScrollOptions {
    /** Whether the agent is currently generating content */
    working: boolean
    /** Called when user manually scrolls up */
    onUserInteracted?: () => void
    /** Threshold in px from bottom to consider "at bottom" */
    bottomThreshold?: number
}

export interface UseAutoScrollReturn {
    /** Ref to attach to the scrollable container */
    scrollRef: React.RefCallback<HTMLElement>
    /** Ref to attach to the content wrapper inside the scrollable container */
    contentRef: React.RefCallback<HTMLElement>
    /** Scroll event handler — attach to the scrollable container's onScroll */
    handleScroll: () => void
    /** Whether the user has scrolled up */
    userScrolled: boolean
    /** Resume auto-scroll (resets userScrolled) */
    resume: () => void
    /** Force scroll to bottom */
    forceScrollToBottom: () => void
}

/**
 * React hook implementing OpenCode-style auto-scroll behavior.
 *
 * Key behaviors:
 * - Automatically scrolls to bottom when content grows (via ResizeObserver)
 * - Detects user scrolling up via wheel events and stops auto-scroll
 * - Ignores scroll events inside nested `[data-scrollable]` regions
 * - Settles for 300ms after working stops to catch final content
 * - Dynamically toggles overflow-anchor to prevent layout jumps
 */
export function useAutoScroll(options: UseAutoScrollOptions): UseAutoScrollReturn {
    const { working, onUserInteracted, bottomThreshold = 10 } = options

    const scrollElRef = useRef<HTMLElement | null>(null)
    const contentElRef = useRef<HTMLElement | null>(null)
    const [userScrolled, setUserScrolled] = useState(false)

    // Track programmatic scrolls to distinguish from user scrolls
    const autoScrollRef = useRef<{ top: number; time: number } | null>(null)
    const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const settlingRef = useRef(false)
    const wheelCleanupRef = useRef<(() => void) | null>(null)
    const resizeObserverRef = useRef<ResizeObserver | null>(null)

    const isActive = useCallback(() => working || settlingRef.current, [working])

    const distanceFromBottom = useCallback((el: HTMLElement) => {
        return el.scrollHeight - el.clientHeight - el.scrollTop
    }, [])

    const canScroll = useCallback((el: HTMLElement) => {
        return el.scrollHeight - el.clientHeight > 1
    }, [])

    const markAuto = useCallback((el: HTMLElement) => {
        autoScrollRef.current = {
            top: Math.max(0, el.scrollHeight - el.clientHeight),
            time: Date.now(),
        }
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
        autoTimerRef.current = setTimeout(() => {
            autoScrollRef.current = null
            autoTimerRef.current = undefined
        }, 1500)
    }, [])

    const isAutoScroll = useCallback((el: HTMLElement) => {
        const a = autoScrollRef.current
        if (!a) return false
        if (Date.now() - a.time > 1500) {
            autoScrollRef.current = null
            return false
        }
        return Math.abs(el.scrollTop - a.top) < 2
    }, [])

    const scrollToBottomNow = useCallback((behavior: ScrollBehavior) => {
        const el = scrollElRef.current
        if (!el) return
        markAuto(el)
        if (behavior === 'smooth') {
            el.scrollTo({ top: el.scrollHeight, behavior })
            return
        }
        // Direct assignment bypasses CSS scroll-behavior: smooth
        el.scrollTop = el.scrollHeight
    }, [markAuto])

    const scrollToBottom = useCallback((force: boolean) => {
        if (!force && !isActive()) return

        if (force && userScrolled) setUserScrolled(false)

        const el = scrollElRef.current
        if (!el) return

        if (!force && userScrolled) return

        const distance = distanceFromBottom(el)
        if (distance < 2) {
            markAuto(el)
            return
        }

        scrollToBottomNow('auto')
    }, [isActive, userScrolled, distanceFromBottom, markAuto, scrollToBottomNow])

    const stop = useCallback(() => {
        const el = scrollElRef.current
        if (!el) return
        if (!canScroll(el)) {
            if (userScrolled) setUserScrolled(false)
            return
        }
        if (userScrolled) return
        setUserScrolled(true)
        onUserInteracted?.()
    }, [canScroll, userScrolled, onUserInteracted])

    // Update overflow-anchor dynamically
    const updateOverflowAnchor = useCallback((el: HTMLElement) => {
        el.style.overflowAnchor = userScrolled ? 'auto' : 'none'
    }, [userScrolled])

    // Scroll event handler
    const handleScroll = useCallback(() => {
        const el = scrollElRef.current
        if (!el) return

        if (!canScroll(el)) {
            if (userScrolled) setUserScrolled(false)
            return
        }

        if (distanceFromBottom(el) < bottomThreshold) {
            if (userScrolled) setUserScrolled(false)
            return
        }

        // Ignore scroll events triggered by our own scrollToBottom calls
        if (!userScrolled && isAutoScroll(el)) {
            scrollToBottom(false)
            return
        }

        stop()
    }, [canScroll, distanceFromBottom, bottomThreshold, userScrolled, isAutoScroll, scrollToBottom, stop])

    // scrollRef callback
    const scrollRef = useCallback((el: HTMLElement | null) => {
        // Clean up previous
        if (wheelCleanupRef.current) {
            wheelCleanupRef.current()
            wheelCleanupRef.current = null
        }

        scrollElRef.current = el
        if (!el) return

        updateOverflowAnchor(el)

        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY >= 0) return
            // Don't treat nested scrollable regions as leaving follow mode
            const target = e.target instanceof Element ? e.target : undefined
            const nested = target?.closest('[data-scrollable]')
            if (nested && nested !== el) return
            stop()
        }

        el.addEventListener('wheel', handleWheel, { passive: true })
        wheelCleanupRef.current = () => el.removeEventListener('wheel', handleWheel)
    }, [updateOverflowAnchor, stop])

    // contentRef callback — setup ResizeObserver
    const contentRef = useCallback((el: HTMLElement | null) => {
        if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect()
            resizeObserverRef.current = null
        }

        contentElRef.current = el
        if (!el) return

        const observer = new ResizeObserver(() => {
            const scrollEl = scrollElRef.current
            if (scrollEl && !canScroll(scrollEl)) {
                setUserScrolled(false)
                return
            }
            if (!isActive()) return
            // Don't scroll if user has scrolled up
            if (userScrolled) return
            scrollToBottom(false)
        })
        observer.observe(el)
        resizeObserverRef.current = observer
    }, [canScroll, isActive, userScrolled, scrollToBottom])

    // Working state changes
    useEffect(() => {
        settlingRef.current = false
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
        settleTimerRef.current = undefined

        if (working) {
            if (!userScrolled) scrollToBottom(true)
            return
        }

        // Settling period after working stops
        settlingRef.current = true
        settleTimerRef.current = setTimeout(() => {
            settlingRef.current = false
        }, 300)
    }, [working]) // eslint-disable-line react-hooks/exhaustive-deps

    // Update overflow-anchor when userScrolled changes
    useEffect(() => {
        const el = scrollElRef.current
        if (el) updateOverflowAnchor(el)
    }, [userScrolled, updateOverflowAnchor])

    // Cleanup
    useEffect(() => {
        return () => {
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
            if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
            if (wheelCleanupRef.current) wheelCleanupRef.current()
            if (resizeObserverRef.current) resizeObserverRef.current.disconnect()
        }
    }, [])

    const resume = useCallback(() => {
        setUserScrolled(false)
        scrollToBottom(true)
    }, [scrollToBottom])

    const forceScrollToBottom = useCallback(() => {
        scrollToBottom(true)
    }, [scrollToBottom])

    return {
        scrollRef,
        contentRef,
        handleScroll,
        userScrolled,
        resume,
        forceScrollToBottom,
    }
}
