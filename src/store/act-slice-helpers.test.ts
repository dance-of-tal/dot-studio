import { describe, it, expect } from 'vitest'
import {
    normalizeSubscriptions,
    normalizeRelationPermissions,
    fallbackParticipantLabel,
    autoLayoutBindings,
} from './act-slice-helpers'

describe('normalizeSubscriptions', () => {
    it('returns null/undefined as-is', () => {
        expect(normalizeSubscriptions(null)).toBeNull()
        expect(normalizeSubscriptions(undefined)).toBeUndefined()
    })

    it('passes through valid subscriptions', () => {
        const input = { callboardKeys: ['a', 'b'], other: true }
        const result = normalizeSubscriptions(input)
        expect(result.callboardKeys).toEqual(['a', 'b'])
        expect(result.other).toBe(true)
    })

    it('preserves subscriptions without callboardKeys', () => {
        const input = { other: 'value' }
        const result = normalizeSubscriptions(input)
        expect(result.other).toBe('value')
        expect(result.callboardKeys).toBeUndefined()
    })
})

describe('normalizeRelationPermissions', () => {
    it('returns null/undefined as-is', () => {
        expect(normalizeRelationPermissions(null)).toBeNull()
        expect(normalizeRelationPermissions(undefined)).toBeUndefined()
    })

    it('passes through permissions with callboardKeys', () => {
        const input = { callboardKeys: ['x'], read: true }
        const result = normalizeRelationPermissions(input)
        expect(result.callboardKeys).toEqual(['x'])
    })
})

describe('fallbackParticipantLabel', () => {
    it('returns draftId for draft refs', () => {
        expect(fallbackParticipantLabel({ kind: 'draft', draftId: 'my-draft' })).toBe('my-draft')
    })

    it('returns last segment of URN for registry refs', () => {
        expect(fallbackParticipantLabel({ kind: 'registry', urn: 'performer/@user/my-performer' })).toBe('my-performer')
    })

    it('returns full URN when no slash', () => {
        expect(fallbackParticipantLabel({ kind: 'registry', urn: 'single' })).toBe('single')
    })
})

describe('autoLayoutBindings', () => {
    it('returns empty object for empty bindings', () => {
        expect(autoLayoutBindings({})).toEqual({})
    })

    it('positions single binding at origin', () => {
        const result = autoLayoutBindings({
            k1: { performerRef: { kind: 'draft', draftId: 'd1' }, position: { x: 0, y: 0 } },
        })
        expect(result.k1.position).toEqual({ x: 40, y: 120 })
    })

    it('lays out 3 entries in a single row', () => {
        const bindings: Record<string, any> = {}
        for (let i = 0; i < 3; i++) {
            bindings[`k${i}`] = {
                performerRef: { kind: 'draft', draftId: `d${i}` },
                position: { x: 0, y: 0 },
            }
        }
        const result = autoLayoutBindings(bindings)
        // 3 entries → 3 columns, so all y = 120 (row 0)
        expect(result.k0.position.y).toBe(120)
        expect(result.k1.position.y).toBe(120)
        expect(result.k2.position.y).toBe(120)
        // x should increment by gapX (260)
        expect(result.k1.position.x - result.k0.position.x).toBe(260)
    })

    it('wraps to next row for 4+ entries', () => {
        const bindings: Record<string, any> = {}
        for (let i = 0; i < 4; i++) {
            bindings[`k${i}`] = {
                performerRef: { kind: 'draft', draftId: `d${i}` },
                position: { x: 0, y: 0 },
            }
        }
        const result = autoLayoutBindings(bindings)
        // 4 entries → columns = min(3, ceil(sqrt(4))) = 2
        // k0: (40, 120), k1: (300, 120), k2: (40, 300), k3: (300, 300)
        expect(result.k0.position.y).toBe(120)
        expect(result.k2.position.y).toBe(120 + 180) // gapY = 180
    })
})
