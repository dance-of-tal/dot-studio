import { describe, expect, it } from 'vitest'
import {
    collectVisibleCanvasNodeRects,
    resolveActCreationClusterLayout,
    resolveCanvasNodeSpawnPosition,
} from './canvas-node-layout'

function overlaps(
    left: { x: number; y: number; width: number; height: number },
    right: { x: number; y: number; width: number; height: number },
    padding = 0,
) {
    return !(
        left.x + left.width + padding <= right.x
        || right.x + right.width + padding <= left.x
        || left.y + left.height + padding <= right.y
        || right.y + right.height + padding <= left.y
    )
}

describe('resolveCanvasNodeSpawnPosition', () => {
    it('avoids overlapping visible performer and act windows', () => {
        const occupiedRects = collectVisibleCanvasNodeRects(
            [{
                id: 'performer-1',
                name: 'Researcher',
                position: { x: 840, y: 500 },
                width: 320,
                height: 400,
                scope: 'shared',
                model: null,
                talRef: null,
                danceRefs: [],
                mcpServerNames: [],
            }],
            [{
                id: 'act-1',
                name: 'Review Flow',
                position: { x: 1200, y: 480 },
                width: 640,
                height: 800,
                participants: {},
                relations: [],
                createdAt: Date.now(),
            }],
        )

        const next = resolveCanvasNodeSpawnPosition({
            canvasCenter: { x: 1000, y: 700 },
            occupiedRects,
            width: 320,
            height: 400,
        })

        expect(overlaps(
            { x: next.x, y: next.y, width: 320, height: 400 },
            occupiedRects[0],
            1,
        )).toBe(false)
        expect(overlaps(
            { x: next.x, y: next.y, width: 320, height: 400 },
            occupiedRects[1],
            1,
        )).toBe(false)
    })
})

describe('resolveActCreationClusterLayout', () => {
    it('places the act below a centered performer grid without overlap', () => {
        const layout = resolveActCreationClusterLayout({
            canvasCenter: { x: 1000, y: 700 },
            occupiedRects: [],
            performerIds: ['performer-1', 'performer-2', 'performer-3'],
        })

        const performers = Array.from(layout.performerPositions.values()).map((position) => ({
            x: position.x,
            y: position.y,
            width: 320,
            height: 400,
        }))
        const act = {
            x: layout.actPosition.x,
            y: layout.actPosition.y,
            width: 640,
            height: 800,
        }

        expect(performers).toHaveLength(3)
        expect(performers.every((performer) => performer.y < act.y)).toBe(true)
        expect(overlaps(performers[0], performers[1], 1)).toBe(false)
        expect(overlaps(performers[1], performers[2], 1)).toBe(false)
        expect(performers.every((performer) => overlaps(performer, act, 1) === false)).toBe(true)
    })
})
