import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'

function shouldKeepTransformChrome(target: HTMLElement | null) {
    if (!target) {
        return false
    }

    return !!target.closest('.canvas-drag-handle--interactive, .canvas-frame__header, .react-flow__resize-control, .canvas-resize-control')
}

type UseTransformChromeOptions = {
    active: boolean
    onActivate?: () => void
    onDeactivate?: () => void
}

export default function useTransformChrome({ active, onActivate, onDeactivate }: UseTransformChromeOptions) {
    const [isResizeActive, setIsResizeActive] = useState(false)

    const activateTransformChrome = useCallback(() => {
        onActivate?.()
    }, [onActivate])

    const handleFramePointerDownCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
        const target = event.target as HTMLElement | null
        if (shouldKeepTransformChrome(target)) {
            return
        }

        onDeactivate?.()
    }, [onDeactivate])

    const handleResizeStart = useCallback(() => {
        onActivate?.()
        setIsResizeActive(true)
    }, [onActivate])

    const handleResizeEnd = useCallback(() => {
        setIsResizeActive(false)
    }, [])

    return {
        isTransformChromeActive: active,
        showResizeChrome: active || isResizeActive,
        activateTransformChrome,
        handleFramePointerDownCapture,
        handleResizeStart,
        handleResizeEnd,
    }
}
