import { describe, expect, it, vi } from 'vitest'
import {
    buildFocusFitViewOptions,
    DEFAULT_FOCUS_VIEWPORT,
    getCanvasViewportSize,
    revealCanvasNodeWithoutZoom,
    syncFocusViewport,
    resolveCanvasNodeViewportCenter,
} from './focus-utils'

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

describe('buildFocusFitViewOptions', () => {
    it('targets the focused node without animation padding', () => {
        expect(buildFocusFitViewOptions('performer-1')).toEqual({
            padding: 0,
            minZoom: 1,
            maxZoom: 1,
            nodes: [{ id: 'performer-1' }],
        })
    })
})

describe('resolveCanvasNodeViewportCenter', () => {
    it('prefers measured dimensions when centering a node', () => {
        expect(resolveCanvasNodeViewportCenter({
            position: { x: 100, y: 80 },
            measured: { width: 320, height: 240 },
            width: 200,
            height: 100,
        })).toEqual({ x: 260, y: 200 })
    })
})

describe('revealCanvasNodeWithoutZoom', () => {
    it('recenters on a node while preserving the current zoom', () => {
        const setCenter = vi.fn()

        revealCanvasNodeWithoutZoom({
            getNode: () => ({
                id: 'performer-1',
                position: { x: 10, y: 20 },
                width: 200,
                height: 100,
                data: {},
            }),
            getViewport: () => ({ x: 0, y: 0, zoom: 1.75 }),
            setCenter,
        }, 'performer-1')

        expect(setCenter).toHaveBeenCalledWith(110, 70, {
            zoom: 1.75,
            duration: 250,
        })
    })
})

describe('syncFocusViewport', () => {
    it('pins the viewport to the fullscreen focus origin without animation', () => {
        const setViewport = vi.fn()

        syncFocusViewport({ setViewport })

        expect(setViewport).toHaveBeenCalledWith({ x: 0, y: 0, zoom: 1 })
    })
})
