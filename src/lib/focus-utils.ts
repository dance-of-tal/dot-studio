/**
 * Shared focus-mode viewport constants and helpers.
 *
 * Centralises the "magic numbers" used when entering/exiting focus mode
 * so every call-site stays consistent.
 */

/** Delay (ms) before calling fitView – gives React Flow time to reconcile node sizes. */
export const FOCUS_FIT_DELAY = 50

/** fitView options when *entering* focus mode (tight padding since the node fills the viewport). */
export const FOCUS_ENTER_FIT = { duration: 400, padding: 0.08, maxZoom: 1 } as const

/** fitView options when *exiting* focus mode (wider padding to show the restored layout). */
export const FOCUS_EXIT_FIT = { duration: 400, padding: 0.2, maxZoom: 1 } as const

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
