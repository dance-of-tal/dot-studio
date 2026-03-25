import { ChevronDown } from 'lucide-react'
import './ScrollToBottom.css'

interface ScrollToBottomProps {
    /** Whether the user has scrolled up */
    visible: boolean
    /** Callback to force scroll to bottom */
    onClick: () => void
}

/**
 * Floating scroll-to-bottom button.
 * Appears when user scrolls up during streaming.
 */
export function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
    return (
        <button
            className={`scroll-to-bottom ${visible ? 'scroll-to-bottom--visible' : ''}`}
            onClick={onClick}
            aria-label="Scroll to bottom"
            type="button"
        >
            <ChevronDown size={14} />
        </button>
    )
}
