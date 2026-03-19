export const ACT_DEFAULT_WIDTH = 340
export const ACT_DEFAULT_EXPANDED_HEIGHT = 420
export const ACT_MIN_EXPANDED_HEIGHT = 360
export const ACT_COLLAPSED_HEIGHT = 116

export function resolveActExpandedHeight(height: number | null | undefined) {
    if (typeof height !== 'number' || !Number.isFinite(height)) {
        return ACT_DEFAULT_EXPANDED_HEIGHT
    }

    return Math.max(ACT_MIN_EXPANDED_HEIGHT, height)
}
