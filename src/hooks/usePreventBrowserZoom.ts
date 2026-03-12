import { useEffect, type RefObject } from 'react';

/**
 * Prevents browser-level zoom gestures (Ctrl+wheel, pinch-to-zoom, gesture events)
 * within the given container element. This ensures that zoom gestures are handled
 * by the canvas (e.g. ReactFlow / d3-zoom) rather than the browser viewport.
 *
 * Must be attached to the canvas root — NOT the document — so that zoom gestures
 * outside the canvas (sidebar, toolbar, modals) still work normally.
 */
export function usePreventBrowserZoom(ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Ctrl+wheel (desktop zoom) and trackpad pinch (which fires as Ctrl+wheel in Chrome)
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
            }
        };

        // Safari trackpad gesture events
        const onGesture = (e: Event) => {
            e.preventDefault();
        };

        // Non-passive to allow preventDefault
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('gesturestart', onGesture, { passive: false });
        el.addEventListener('gesturechange', onGesture, { passive: false });
        el.addEventListener('gestureend', onGesture, { passive: false });

        return () => {
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('gesturestart', onGesture);
            el.removeEventListener('gesturechange', onGesture);
            el.removeEventListener('gestureend', onGesture);
        };
    }, [ref]);
}
