import { describe, expect, it } from 'vitest'
import {
    ACT_DEFAULT_EXPANDED_HEIGHT,
    ACT_MIN_EXPANDED_HEIGHT,
    resolveActExpandedHeight,
} from './act-layout'

describe('resolveActExpandedHeight', () => {
    it('falls back to the default expanded height when missing', () => {
        expect(resolveActExpandedHeight(undefined)).toBe(ACT_DEFAULT_EXPANDED_HEIGHT)
    })

    it('upgrades legacy short act heights to the minimum usable height', () => {
        expect(resolveActExpandedHeight(80)).toBe(ACT_MIN_EXPANDED_HEIGHT)
        expect(resolveActExpandedHeight(320)).toBe(ACT_MIN_EXPANDED_HEIGHT)
    })

    it('preserves larger custom heights', () => {
        expect(resolveActExpandedHeight(540)).toBe(540)
    })
})
