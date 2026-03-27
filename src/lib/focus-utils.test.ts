import { describe, expect, it } from 'vitest'
import { DEFAULT_FOCUS_VIEWPORT, getCanvasViewportSize } from './focus-utils'

describe('getCanvasViewportSize', () => {
    it('prefers the canvas area bounds when available', () => {
        const root = {
            querySelector: (selector: string) => {
                if (selector !== '.canvas-area') return null
                return {
                    getBoundingClientRect: () => ({ width: 913.8, height: 701.2 }),
                }
            },
        }

        expect(getCanvasViewportSize(root)).toEqual({ width: 914, height: 701 })
    })

    it('falls back to the React Flow pane when the canvas area is unavailable', () => {
        const root = {
            querySelector: (selector: string) => {
                if (selector === '.react-flow__pane') {
                    return {
                        clientWidth: 1024,
                        clientHeight: 768,
                    }
                }
                return null
            },
        }

        expect(getCanvasViewportSize(root)).toEqual({ width: 1024, height: 768 })
    })

    it('returns the provided fallback when no measurable element is found', () => {
        expect(getCanvasViewportSize(undefined, { width: 900, height: 700 })).toEqual({ width: 900, height: 700 })
        expect(getCanvasViewportSize(undefined)).toEqual(DEFAULT_FOCUS_VIEWPORT)
    })
})
