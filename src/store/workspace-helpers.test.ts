import { describe, it, expect } from 'vitest'
import {
    normalizePath,
    getMaxPerformerCounter,
    getMaxMarkdownEditorCounter,
    applyPerformerPatch,
    mapPerformers,
    mapMarkdownEditors,
    mapCanvasTerminals,
} from './workspace-helpers'

describe('normalizePath', () => {
    it('removes trailing slashes', () => {
        expect(normalizePath('/foo/bar/')).toBe('/foo/bar')
        expect(normalizePath('/foo/bar///')).toBe('/foo/bar')
    })

    it('trims whitespace', () => {
        expect(normalizePath('  /foo/bar  ')).toBe('/foo/bar')
    })

    it('handles empty string', () => {
        expect(normalizePath('')).toBe('')
    })

    it('preserves paths without trailing slash', () => {
        expect(normalizePath('/foo/bar')).toBe('/foo/bar')
    })
})

describe('getMaxPerformerCounter', () => {
    it('returns max from performer IDs', () => {
        expect(getMaxPerformerCounter([
            { id: 'performer-1' },
            { id: 'performer-5' },
            { id: 'performer-3' },
        ])).toBe(5)
    })

    it('returns 0 for empty array', () => {
        expect(getMaxPerformerCounter([])).toBe(0)
    })

    it('ignores non-matching IDs', () => {
        expect(getMaxPerformerCounter([
            { id: 'custom-node' },
            { id: 'performer-2' },
        ])).toBe(2)
    })

    it('returns 0 when no IDs match pattern', () => {
        expect(getMaxPerformerCounter([
            { id: 'foo' },
            { id: 'bar' },
        ])).toBe(0)
    })
})

describe('getMaxMarkdownEditorCounter', () => {
    it('returns max from editor IDs', () => {
        expect(getMaxMarkdownEditorCounter([
            { id: 'markdown-editor-1' },
            { id: 'markdown-editor-4' },
        ])).toBe(4)
    })

    it('returns 0 for empty array', () => {
        expect(getMaxMarkdownEditorCounter([])).toBe(0)
    })
})

describe('applyPerformerPatch', () => {
    const base = {
        id: 'p-1',
        name: 'Test',
        talRef: null,
        meta: { publishBindingUrn: 'urn:test' },
    }

    it('applies a simple name patch', () => {
        const result = applyPerformerPatch(base, { name: 'Renamed' })
        expect(result.name).toBe('Renamed')
    })

    it('resets publishBindingUrn when publish-identity fields change', () => {
        const result = applyPerformerPatch(base, { talRef: 'tal/foo' })
        expect(result.meta.publishBindingUrn).toBeNull()
    })

    it('preserves publishBindingUrn for non-identity patches', () => {
        const result = applyPerformerPatch(base, { someOtherField: true })
        expect(result.meta.publishBindingUrn).toBe('urn:test')
    })
})

describe('mapPerformers', () => {
    it('updates the targeted performer', () => {
        const performers = [
            { id: 'p-1', name: 'A' },
            { id: 'p-2', name: 'B' },
        ]
        const result = mapPerformers(performers, 'p-1', (p) => ({ ...p, name: 'Updated' }))
        expect(result[0].name).toBe('Updated')
        expect(result[1].name).toBe('B')
    })

    it('returns unchanged array when ID not found', () => {
        const performers = [{ id: 'p-1', name: 'A' }]
        const result = mapPerformers(performers, 'p-999', (p) => ({ ...p, name: 'X' }))
        expect(result[0].name).toBe('A')
    })
})

describe('mapMarkdownEditors', () => {
    it('updates the targeted editor', () => {
        const editors = [{ id: 'e-1', content: '' }, { id: 'e-2', content: '' }]
        const result = mapMarkdownEditors(editors, 'e-2', (e) => ({ ...e, content: 'new' }))
        expect(result[1].content).toBe('new')
        expect(result[0].content).toBe('')
    })
})

describe('mapCanvasTerminals', () => {
    it('updates the targeted terminal', () => {
        const terminals = [{ id: 't-1', sessionId: null }, { id: 't-2', sessionId: null }]
        const result = mapCanvasTerminals(terminals, 't-1', (t) => ({ ...t, sessionId: 'sess-1' }))
        expect(result[0].sessionId).toBe('sess-1')
    })
})
