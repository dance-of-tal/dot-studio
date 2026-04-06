import type { PerformerNode, WorkspaceAct } from '../types'
import {
    ACT_DEFAULT_EXPANDED_HEIGHT,
    ACT_DEFAULT_WIDTH,
} from './act-layout'
import {
    PERFORMER_DEFAULT_HEIGHT,
    PERFORMER_DEFAULT_WIDTH,
} from './performers-node'

const DEFAULT_RECT_PADDING = 32
const DEFAULT_FALLBACK_MARGIN = 60
const DEFAULT_CLUSTER_GAP_X = 48
const DEFAULT_CLUSTER_GAP_Y = 40
const DEFAULT_ACT_CLUSTER_GAP = 56
const MAX_SEARCH_RADIUS = 12

export interface CanvasRect {
    x: number
    y: number
    width: number
    height: number
}

function resolveAnchorPosition(input: {
    canvasCenter: { x: number; y: number } | null
    width: number
    height: number
    fallbackCenter?: { x: number; y: number }
    centerOffset?: { x: number; y: number }
}) {
    const anchor = input.canvasCenter || input.fallbackCenter || {
        x: (input.width / 2) + DEFAULT_FALLBACK_MARGIN,
        y: (input.height / 2) + DEFAULT_FALLBACK_MARGIN,
    }
    const centerOffset = input.centerOffset || { x: 0, y: 0 }

    return {
        x: Math.round(anchor.x + centerOffset.x - (input.width / 2)),
        y: Math.round(anchor.y + centerOffset.y - (input.height / 2)),
    }
}

function overlaps(left: CanvasRect, right: CanvasRect, padding = DEFAULT_RECT_PADDING) {
    return !(
        left.x + left.width + padding <= right.x
        || right.x + right.width + padding <= left.x
        || left.y + left.height + padding <= right.y
        || right.y + right.height + padding <= left.y
    )
}

function buildCandidateOffsets(radius: number) {
    if (radius === 0) {
        return [{ col: 0, row: 0 }]
    }

    const entries: Array<{ col: number; row: number }> = []
    for (let row = -radius; row <= radius; row += 1) {
        for (let col = -radius; col <= radius; col += 1) {
            if (Math.max(Math.abs(col), Math.abs(row)) !== radius) continue
            entries.push({ col, row })
        }
    }

    return entries.sort((left, right) => {
        const leftScore = Math.abs(left.col) + Math.abs(left.row)
        const rightScore = Math.abs(right.col) + Math.abs(right.row)
        if (leftScore !== rightScore) return leftScore - rightScore
        if (Math.abs(left.row) !== Math.abs(right.row)) return Math.abs(left.row) - Math.abs(right.row)
        if (left.row !== right.row) return left.row - right.row
        return left.col - right.col
    })
}

export function collectVisibleCanvasNodeRects(
    performers: PerformerNode[],
    acts: WorkspaceAct[],
): CanvasRect[] {
    const performerRects = performers
        .filter((performer) => performer.hidden !== true)
        .map((performer) => ({
            x: performer.position.x,
            y: performer.position.y,
            width: performer.width || PERFORMER_DEFAULT_WIDTH,
            height: performer.height || PERFORMER_DEFAULT_HEIGHT,
        }))

    const actRects = acts
        .filter((act) => act.hidden !== true)
        .map((act) => ({
            x: act.position.x,
            y: act.position.y,
            width: act.width || ACT_DEFAULT_WIDTH,
            height: act.height || ACT_DEFAULT_EXPANDED_HEIGHT,
        }))

    return [...performerRects, ...actRects]
}

export function resolveCanvasNodeSpawnPosition(input: {
    canvasCenter: { x: number; y: number } | null
    occupiedRects: CanvasRect[]
    width: number
    height: number
    fallbackCenter?: { x: number; y: number }
    centerOffset?: { x: number; y: number }
    padding?: number
}) {
    const base = resolveAnchorPosition(input)
    const stepX = input.width + DEFAULT_RECT_PADDING
    const stepY = input.height + DEFAULT_RECT_PADDING
    const padding = input.padding ?? DEFAULT_RECT_PADDING

    for (let radius = 0; radius <= MAX_SEARCH_RADIUS; radius += 1) {
        for (const offset of buildCandidateOffsets(radius)) {
            const candidate = {
                x: base.x + (offset.col * stepX),
                y: base.y + (offset.row * stepY),
                width: input.width,
                height: input.height,
            }
            if (!input.occupiedRects.some((rect) => overlaps(candidate, rect, padding))) {
                return { x: candidate.x, y: candidate.y }
            }
        }
    }

    return { x: base.x, y: base.y }
}

export function resolveActCreationClusterLayout(input: {
    canvasCenter: { x: number; y: number } | null
    occupiedRects: CanvasRect[]
    performerIds: string[]
    performerWidth?: number
    performerHeight?: number
    actWidth?: number
    actHeight?: number
}) {
    const performerWidth = input.performerWidth || PERFORMER_DEFAULT_WIDTH
    const performerHeight = input.performerHeight || PERFORMER_DEFAULT_HEIGHT
    const actWidth = input.actWidth || ACT_DEFAULT_WIDTH
    const actHeight = input.actHeight || ACT_DEFAULT_EXPANDED_HEIGHT
    const performerCount = input.performerIds.length

    const columns = performerCount <= 1 ? performerCount : Math.min(3, Math.ceil(Math.sqrt(performerCount)))
    const rows = performerCount === 0 ? 0 : Math.ceil(performerCount / columns)
    const performerGridWidth = performerCount === 0
        ? 0
        : (columns * performerWidth) + ((columns - 1) * DEFAULT_CLUSTER_GAP_X)
    const performerGridHeight = performerCount === 0
        ? 0
        : (rows * performerHeight) + ((rows - 1) * DEFAULT_CLUSTER_GAP_Y)
    const actGap = performerCount > 0 ? DEFAULT_ACT_CLUSTER_GAP : 0
    const clusterWidth = Math.max(actWidth, performerGridWidth)
    const clusterHeight = performerGridHeight + actGap + actHeight
    const clusterOrigin = resolveCanvasNodeSpawnPosition({
        canvasCenter: input.canvasCenter,
        occupiedRects: input.occupiedRects,
        width: clusterWidth,
        height: clusterHeight,
    })

    const performerPositions = new Map<string, { x: number; y: number }>()
    for (let row = 0; row < rows; row += 1) {
        const rowStartIndex = row * columns
        const rowIds = input.performerIds.slice(rowStartIndex, rowStartIndex + columns)
        const rowWidth = (rowIds.length * performerWidth) + ((rowIds.length - 1) * DEFAULT_CLUSTER_GAP_X)
        const rowX = clusterOrigin.x + Math.round((clusterWidth - rowWidth) / 2)
        const rowY = clusterOrigin.y + (row * (performerHeight + DEFAULT_CLUSTER_GAP_Y))

        rowIds.forEach((performerId, index) => {
            performerPositions.set(performerId, {
                x: rowX + (index * (performerWidth + DEFAULT_CLUSTER_GAP_X)),
                y: rowY,
            })
        })
    }

    return {
        actPosition: {
            x: clusterOrigin.x + Math.round((clusterWidth - actWidth) / 2),
            y: clusterOrigin.y + performerGridHeight + actGap,
        },
        performerPositions,
    }
}
