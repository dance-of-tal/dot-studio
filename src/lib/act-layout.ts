import {
    PERFORMER_DEFAULT_HEIGHT,
    PERFORMER_DEFAULT_WIDTH,
} from './performers-node'

export const ACT_DEFAULT_WIDTH = PERFORMER_DEFAULT_WIDTH * 2
export const ACT_DEFAULT_EXPANDED_HEIGHT = PERFORMER_DEFAULT_HEIGHT * 2
export const ACT_MIN_EXPANDED_HEIGHT = 360
export const ACT_COLLAPSED_HEIGHT = 116

export function resolveActExpandedHeight(height: number | null | undefined) {
    if (typeof height !== 'number' || !Number.isFinite(height)) {
        return ACT_DEFAULT_EXPANDED_HEIGHT
    }

    return Math.max(ACT_MIN_EXPANDED_HEIGHT, height)
}
