import { describe, expect, it } from 'vitest'
import { assetUrnAuthor, assetUrnDisplayName, assetUrnPath, parseStudioAssetUrn } from './asset-urn'

describe('asset urn parsing', () => {
    it('parses canonical 4-segment urns', () => {
        expect(parseStudioAssetUrn('performer/@acme/agent-presets/reviewer')).toEqual({
            kind: 'performer',
            author: '@acme',
            path: 'agent-presets/reviewer',
            name: 'reviewer',
            stage: 'agent-presets',
        })
        expect(assetUrnDisplayName('performer/@acme/agent-presets/reviewer')).toBe('reviewer')
        expect(assetUrnAuthor('performer/@acme/agent-presets/reviewer')).toBe('@acme')
        expect(assetUrnPath('performer/@acme/agent-presets/reviewer')).toBe('agent-presets/reviewer')
    })

    it('rejects legacy 3-segment urns', () => {
        expect(parseStudioAssetUrn('performer/@acme/reviewer')).toBeNull()
        expect(assetUrnAuthor('performer/@acme/reviewer')).toBeNull()
        expect(assetUrnPath('performer/@acme/reviewer')).toBeNull()
        expect(assetUrnDisplayName('performer/@acme/reviewer')).toBe('reviewer')
    })
})
