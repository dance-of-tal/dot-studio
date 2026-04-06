import { useRef, useCallback, useEffect, useState } from 'react'

export interface UseAutoScrollOptions {
    /** Stable chat/thread key for preserving scroll state across switches */
    stateKey?: string | null
    /** Changes when visible content changes and may require follow-scroll */
    contentVersion?: unknown
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
}

type SavedScrollState = {
    scrollTop: number
    userScrolled: boolean
}

const savedScrollStates = new Map<string, SavedScrollState>()

export function useAutoScroll(options: UseAutoScrollOptions): UseAutoScrollReturn {
    const {
        stateKey = null,
        contentVersion,
        onUserInteracted,
        bottomThreshold = 10,
    } = options

    const scrollElRef = useRef<HTMLElement | null>(null)
    const [userScrolled, setUserScrolled] = useState(false)
    const userScrolledRef = useRef(false)
    const lastScrollTopRef = useRef(0)
    const programmaticScrollRef = useRef(false)
    const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const resizeObserverRef = useRef<ResizeObserver | null>(null)
    const wheelCleanupRef = useRef<(() => void) | null>(null)
    const activeStateKeyRef = useRef<string | null>(stateKey)
    const pendingRestoreRef = useRef<SavedScrollState | 'bottom' | null>(null)

    const distanceFromBottom = useCallback((el: HTMLElement) => (
        el.scrollHeight - el.clientHeight - el.scrollTop
    ), [])

    const isNearBottom = useCallback((el: HTMLElement) => (
        distanceFromBottom(el) <= bottomThreshold
    ), [bottomThreshold, distanceFromBottom])

    const canScroll = useCallback((el: HTMLElement) => (
        el.scrollHeight - el.clientHeight > 1
    ), [])

    const persistState = useCallback((override?: Partial<SavedScrollState>) => {
        const key = activeStateKeyRef.current
        const el = scrollElRef.current
        if (!key || !el) return

        savedScrollStates.set(key, {
            scrollTop: override?.scrollTop ?? el.scrollTop,
            userScrolled: override?.userScrolled ?? userScrolledRef.current,
        })
    }, [])

    const setDetached = useCallback((detached: boolean) => {
        userScrolledRef.current = detached
        setUserScrolled((current) => (current === detached ? current : detached))
    }, [])

    const beginProgrammaticScroll = useCallback(() => {
        programmaticScrollRef.current = true
        if (programmaticTimerRef.current) {
            clearTimeout(programmaticTimerRef.current)
        }
        programmaticTimerRef.current = setTimeout(() => {
            programmaticScrollRef.current = false
            programmaticTimerRef.current = undefined
        }, 80)
    }, [])

    const scrollToBottomNow = useCallback(() => {
        const el = scrollElRef.current
        if (!el) return
        beginProgrammaticScroll()
        el.scrollTop = el.scrollHeight
        lastScrollTopRef.current = el.scrollTop
        setDetached(false)
        persistState({
            scrollTop: Math.max(0, el.scrollHeight - el.clientHeight),
            userScrolled: false,
        })
    }, [beginProgrammaticScroll, persistState, setDetached])

    const applyPendingRestore = useCallback(() => {
        const el = scrollElRef.current
        const pending = pendingRestoreRef.current
        if (!el || !pending) return

        if (pending === 'bottom') {
            pendingRestoreRef.current = null
            scrollToBottomNow()
            return
        }

        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
        beginProgrammaticScroll()
        el.scrollTop = Math.min(pending.scrollTop, maxTop)
        lastScrollTopRef.current = el.scrollTop
        setDetached(pending.userScrolled)
        persistState({
            scrollTop: el.scrollTop,
            userScrolled: pending.userScrolled,
        })
        pendingRestoreRef.current = null
    }, [beginProgrammaticScroll, persistState, scrollToBottomNow, setDetached])

    const followIfPinnedToBottom = useCallback(() => {
        const el = scrollElRef.current
        if (!el || pendingRestoreRef.current) return
        if (userScrolledRef.current) {
            persistState()
            return
        }
        scrollToBottomNow()
    }, [persistState, scrollToBottomNow])

    const detach = useCallback(() => {
        const el = scrollElRef.current
        if (!el || !canScroll(el) || userScrolledRef.current) return
        setDetached(true)
        persistState({ scrollTop: el.scrollTop, userScrolled: true })
        onUserInteracted?.()
    }, [canScroll, onUserInteracted, persistState, setDetached])

    const handleScroll = useCallback(() => {
        const el = scrollElRef.current
        if (!el) return

        const previousTop = lastScrollTopRef.current
        const currentTop = el.scrollTop
        const movingUp = currentTop < previousTop - 1
        lastScrollTopRef.current = currentTop

        if (!canScroll(el)) {
            setDetached(false)
            persistState({ scrollTop: currentTop, userScrolled: false })
            return
        }

        if (programmaticScrollRef.current) {
            persistState({ scrollTop: currentTop })
            return
        }

        if (movingUp) {
            detach()
            persistState({ scrollTop: currentTop, userScrolled: true })
            return
        }

        if (isNearBottom(el)) {
            setDetached(false)
            persistState({ scrollTop: currentTop, userScrolled: false })
            return
        }

        if (userScrolledRef.current) {
            persistState({ scrollTop: currentTop, userScrolled: true })
            return
        }

        persistState({ scrollTop: currentTop, userScrolled: false })
    }, [canScroll, detach, isNearBottom, persistState, setDetached])

    const isScrollableBoundary = useCallback((el: Element | null) => {
        if (!(el instanceof HTMLElement)) {
            return false
        }
        return (el.scrollHeight - el.clientHeight > 1) || (el.scrollWidth - el.clientWidth > 1)
    }, [])

    const updateOverflowAnchor = useCallback((el: HTMLElement) => {
        el.style.overflowAnchor = 'none'
    }, [])

    const scrollRef = useCallback((el: HTMLElement | null) => {
        if (wheelCleanupRef.current) {
            wheelCleanupRef.current()
            wheelCleanupRef.current = null
        }

        if (!el) {
            persistState()
            scrollElRef.current = null
            return
        }

        scrollElRef.current = el
        updateOverflowAnchor(el)
        lastScrollTopRef.current = el.scrollTop

        const handleWheel = (event: WheelEvent) => {
            if (event.deltaY >= 0) return

            const target = event.target instanceof Element ? event.target : null
            const nested = target?.closest('[data-scrollable]')
            if (nested && nested !== el && isScrollableBoundary(nested)) {
                return
            }

            detach()
        }

        el.addEventListener('wheel', handleWheel, { passive: true })
        wheelCleanupRef.current = () => el.removeEventListener('wheel', handleWheel)

        queueMicrotask(() => {
            applyPendingRestore()
        })
    }, [applyPendingRestore, detach, isScrollableBoundary, persistState, updateOverflowAnchor])

    const contentRef = useCallback((el: HTMLElement | null) => {
        if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect()
            resizeObserverRef.current = null
        }

        if (!el) return

        const observer = new ResizeObserver(() => {
            if (pendingRestoreRef.current) {
                applyPendingRestore()
                return
            }
            followIfPinnedToBottom()
        })

        observer.observe(el)
        resizeObserverRef.current = observer
    }, [applyPendingRestore, followIfPinnedToBottom])

    useEffect(() => {
        if (activeStateKeyRef.current && activeStateKeyRef.current !== stateKey) {
            persistState()
        }

        activeStateKeyRef.current = stateKey
        const savedState = stateKey ? savedScrollStates.get(stateKey) ?? null : null

        userScrolledRef.current = savedState?.userScrolled ?? false
        setUserScrolled(savedState?.userScrolled ?? false)
        pendingRestoreRef.current = savedState ?? 'bottom'

        queueMicrotask(() => {
            applyPendingRestore()
        })
    }, [applyPendingRestore, persistState, stateKey])

    useEffect(() => {
        const el = scrollElRef.current
        if (!el) return

        if (pendingRestoreRef.current) {
            queueMicrotask(() => {
                applyPendingRestore()
            })
            return
        }

        followIfPinnedToBottom()
    }, [applyPendingRestore, contentVersion, followIfPinnedToBottom])

    useEffect(() => {
        const el = scrollElRef.current
        if (!el) return
        updateOverflowAnchor(el)
    }, [updateOverflowAnchor, userScrolled])

    useEffect(() => {
        return () => {
            persistState()
            if (programmaticTimerRef.current) {
                clearTimeout(programmaticTimerRef.current)
            }
            if (wheelCleanupRef.current) {
                wheelCleanupRef.current()
            }
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect()
            }
        }
    }, [persistState])

    return {
        scrollRef,
        contentRef,
        handleScroll,
    }
}
