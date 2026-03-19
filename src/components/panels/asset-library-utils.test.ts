import { describe, it, expect } from 'vitest'
import {
    normalizeAuthor,
    displayUrn,
    isInstalledAssetKind,
    getAssetUrn,
    getAssetSelectionKey,
    buildSearchHaystack,
    buildModelHaystack,
    buildMcpHaystack,
    classifyModelProvider,
    scoreModel,
    filterInstalledAssets,
    buildRegistryGroups,
    placeholderForLocalSection,
    buildDraftAssetCards,
    labelForInstalledKind,
} from './asset-library-utils'

describe('normalizeAuthor', () => {
    it('prefixes @ when missing', () => {
        expect(normalizeAuthor('user')).toBe('@user')
    })

    it('keeps @ when present', () => {
        expect(normalizeAuthor('@user')).toBe('@user')
    })

    it('returns empty for falsy input', () => {
        expect(normalizeAuthor(undefined)).toBe('')
        expect(normalizeAuthor('')).toBe('')
    })
})

describe('displayUrn', () => {
    it('returns last segment', () => {
        expect(displayUrn('tal/@user/my-tal')).toBe('my-tal')
    })

    it('handles single segment', () => {
        expect(displayUrn('single')).toBe('single')
    })
})

describe('isInstalledAssetKind', () => {
    it('returns true for valid kinds', () => {
        expect(isInstalledAssetKind('tal')).toBe(true)
        expect(isInstalledAssetKind('dance')).toBe(true)
        expect(isInstalledAssetKind('performer')).toBe(true)
        expect(isInstalledAssetKind('act')).toBe(true)
    })

    it('returns false for invalid kinds', () => {
        expect(isInstalledAssetKind('model')).toBe(false)
        expect(isInstalledAssetKind('mcp')).toBe(false)
        expect(isInstalledAssetKind('')).toBe(false)
    })
})

describe('getAssetUrn', () => {
    it('returns urn when present', () => {
        expect(getAssetUrn({ urn: 'tal/@user/foo' })).toBe('tal/@user/foo')
    })

    it('constructs urn from kind/author/name', () => {
        expect(getAssetUrn({ kind: 'tal', author: 'user', name: 'foo', slug: 'foo' })).toBe('tal/@user/foo')
    })

    it('returns null for null input', () => {
        expect(getAssetUrn(null)).toBeNull()
    })

    it('returns null for model kind', () => {
        expect(getAssetUrn({ kind: 'model', name: 'gpt-4' })).toBeNull()
    })
})

describe('getAssetSelectionKey', () => {
    it('uses urn when available', () => {
        expect(getAssetSelectionKey({ urn: 'tal/@user/foo', kind: 'tal' })).toBe('tal/@user/foo')
    })

    it('generates model key', () => {
        expect(getAssetSelectionKey({ kind: 'model', provider: 'anthropic', id: 'claude-3' })).toBe('model:anthropic:claude-3')
    })

    it('generates mcp key', () => {
        expect(getAssetSelectionKey({ kind: 'mcp', name: 'my-server' })).toBe('mcp:my-server')
    })
})

describe('buildSearchHaystack', () => {
    it('combines name, author, urn, description, tags', () => {
        const result = buildSearchHaystack({
            name: 'My Asset',
            author: '@user',
            urn: 'tal/@user/my-asset',
            description: 'A cool asset',
            tags: ['tag1', 'tag2'],
        })
        expect(result).toContain('my asset')
        expect(result).toContain('@user')
        expect(result).toContain('tag1')
    })

    it('handles missing fields gracefully', () => {
        const result = buildSearchHaystack({ name: 'Test' })
        expect(result).toContain('test')
    })
})

describe('buildModelHaystack', () => {
    it('includes model name and provider', () => {
        const result = buildModelHaystack({ name: 'GPT-4', provider: 'openai', toolCall: true })
        expect(result).toContain('gpt-4')
        expect(result).toContain('openai')
        expect(result).toContain('tool-call')
    })
})

describe('buildMcpHaystack', () => {
    it('includes server name and tools', () => {
        const result = buildMcpHaystack({
            name: 'my-server',
            status: 'connected',
            tools: [{ name: 'read', description: 'Read files' }],
        })
        expect(result).toContain('my-server')
        expect(result).toContain('read')
    })
})

describe('classifyModelProvider', () => {
    it('classifies anthropic', () => {
        expect(classifyModelProvider({ provider: 'anthropic' })).toBe('anthropic')
    })

    it('classifies openai', () => {
        expect(classifyModelProvider({ provider: 'openai' })).toBe('openai')
    })

    it('classifies google/gemini', () => {
        expect(classifyModelProvider({ providerName: 'Google AI' })).toBe('google')
    })

    it('classifies xai/grok', () => {
        expect(classifyModelProvider({ provider: 'xai' })).toBe('xai')
    })

    it('falls back to other', () => {
        expect(classifyModelProvider({ provider: 'custom' })).toBe('other')
    })
})

describe('scoreModel', () => {
    it('scores connected models higher', () => {
        const connected = scoreModel({ connected: true, name: 'test', context: 0 })
        const disconnected = scoreModel({ connected: false, name: 'test', context: 0 })
        expect(connected).toBeGreaterThan(disconnected)
    })

    it('scores sonnet models high', () => {
        const score = scoreModel({ name: 'Claude Sonnet', connected: true, context: 200000 })
        expect(score).toBeGreaterThan(1100) // 1000 (connected) + 140 (sonnet) + context bonus
    })

    it('penalizes preview/mini models', () => {
        const regular = scoreModel({ name: 'GPT-5', connected: true, context: 0 })
        const preview = scoreModel({ name: 'GPT-5 Preview', connected: true, context: 0 })
        expect(regular).toBeGreaterThan(preview)
    })
})

describe('filterInstalledAssets', () => {
    const assets = [
        { name: 'Alpha', source: 'global', kind: 'tal', author: '@a', urn: 'tal/@a/alpha' },
        { name: 'Beta', source: 'stage', kind: 'dance', author: '@b', urn: 'dance/@b/beta'  },
        { name: 'Gamma', source: 'draft', kind: 'tal', author: '@c', urn: 'tal/@c/gamma'  },
    ] as any[]

    it('filters by source', () => {
        expect(filterInstalledAssets(assets, 'global', '')).toHaveLength(1)
        expect(filterInstalledAssets(assets, 'draft', '')).toHaveLength(1)
    })

    it('returns all when source is all', () => {
        expect(filterInstalledAssets(assets, 'all', '')).toHaveLength(3)
    })

    it('filters by query text', () => {
        expect(filterInstalledAssets(assets, 'all', 'alpha')).toHaveLength(1)
    })

    it('returns none for no match', () => {
        expect(filterInstalledAssets(assets, 'all', 'zzz')).toHaveLength(0)
    })
})

describe('buildRegistryGroups', () => {
    it('groups by kind and maintains order', () => {
        const results = [
            { kind: 'tal', name: 'T1' },
            { kind: 'dance', name: 'D1' },
            { kind: 'tal', name: 'T2' },
        ]
        const groups = buildRegistryGroups(results)
        expect(groups).toHaveLength(2) // performer (0 items) filtered out
        expect(groups[0].kind).toBe('tal')
        expect(groups[0].items).toHaveLength(2)
        expect(groups[1].kind).toBe('dance')
    })

    it('filters out empty groups', () => {
        const groups = buildRegistryGroups([{ kind: 'tal', name: 'T1' }])
        expect(groups).toHaveLength(1)
    })
})

describe('placeholderForLocalSection', () => {
    it('returns installed placeholder', () => {
        expect(placeholderForLocalSection('installed', 'models')).toBe('name, urn, author, tag...')
    })

    it('returns model placeholder for runtime models', () => {
        expect(placeholderForLocalSection('runtime', 'models')).toBe('model, provider, capability...')
    })

    it('returns mcp placeholder for runtime mcps', () => {
        expect(placeholderForLocalSection('runtime', 'mcps')).toBe('server, tool, status...')
    })
})

describe('labelForInstalledKind', () => {
    it('returns correct labels', () => {
        expect(labelForInstalledKind('tal')).toBe('Tal')
        expect(labelForInstalledKind('dance')).toBe('Dance')
        expect(labelForInstalledKind('performer')).toBe('Performer')
        expect(labelForInstalledKind('act')).toBe('Act')
    })
})

describe('buildDraftAssetCards', () => {
    it('builds cards from drafts filtered by kind', () => {
        const drafts = {
            d1: { id: 'd1', kind: 'tal', name: 'Draft Tal', updatedAt: 100, content: '# hello' },
            d2: { id: 'd2', kind: 'dance', name: 'Draft Dance', updatedAt: 200, content: '## dance' },
            d3: { id: 'd3', kind: 'tal', name: 'Another Tal', updatedAt: 300, content: '' },
        } as any
        const cards = buildDraftAssetCards(drafts, 'tal')
        expect(cards).toHaveLength(2)
        // Should be sorted by updatedAt descending
        expect(cards[0].name).toBe('Another Tal')
        expect(cards[1].name).toBe('Draft Tal')
    })

    it('returns empty for no matching drafts', () => {
        expect(buildDraftAssetCards({}, 'performer')).toHaveLength(0)
    })
})
