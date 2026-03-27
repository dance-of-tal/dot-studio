import type { FocusSnapshot } from '../store/types'

/**
 * Shared focus-mode viewport constants and helpers.
 *
 * Centralises the "magic numbers" used when entering/exiting focus mode
 * so every call-site stays consistent.
 */

/** Delay (ms) before calling fitView – gives React Flow time to reconcile node sizes. */
export const FOCUS_FIT_DELAY = 50

/** fitView options when *entering* focus mode — zero padding for true fullscreen. */
export const FOCUS_ENTER_FIT = { duration: 400, padding: 0, maxZoom: 1 } as const

/** fitView options when *exiting* focus mode (wider padding to show the restored layout). */
export const FOCUS_EXIT_FIT = { duration: 400, padding: 0.2, maxZoom: 1 } as const

export const DEFAULT_FOCUS_VIEWPORT = { width: 1200, height: 800 } as const

type ViewportSize = { width: number; height: number }

type QueryableRoot = {
    querySelector?: (selector: string) => {
        getBoundingClientRect?: () => { width?: number; height?: number }
        clientWidth?: number
        clientHeight?: number
    } | null
} | null | undefined

/**
 * Schedule a fitView after a short delay.
 * Used after entering/exiting focus mode so the viewport catches up to the new node sizes.
 */
export function scheduleFitView(
    fitView: (opts: { duration?: number; padding?: number; maxZoom?: number }) => void,
    mode: 'enter' | 'exit',
) {
    const opts = mode === 'enter' ? FOCUS_ENTER_FIT : FOCUS_EXIT_FIT
    setTimeout(() => { fitView(opts) }, FOCUS_FIT_DELAY)
}

export function getCanvasViewportSize(
    root: QueryableRoot = typeof document !== 'undefined' ? document : undefined,
    fallback: ViewportSize = DEFAULT_FOCUS_VIEWPORT,
): ViewportSize {
    const canvasElement = root?.querySelector?.('.canvas-area')
    const canvasRect = canvasElement?.getBoundingClientRect?.()
    const canvasWidth = Math.round(canvasRect?.width ?? canvasElement?.clientWidth ?? 0)
    const canvasHeight = Math.round(canvasRect?.height ?? canvasElement?.clientHeight ?? 0)

    if (canvasWidth > 0 && canvasHeight > 0) {
        return { width: canvasWidth, height: canvasHeight }
    }

    const paneElement = root?.querySelector?.('.react-flow__pane')
    const paneWidth = Math.round(paneElement?.clientWidth ?? 0)
    const paneHeight = Math.round(paneElement?.clientHeight ?? 0)

    if (paneWidth > 0 && paneHeight > 0) {
        return { width: paneWidth, height: paneHeight }
    }

    return fallback
}

export function resolveFocusNodeId(
    focusSnapshot: FocusSnapshot | null,
    focusedNodeId: string | null,
) {
    if (!focusSnapshot) {
        return null
    }

    return focusedNodeId || focusSnapshot.nodeId || focusSnapshot.actId || null
}
