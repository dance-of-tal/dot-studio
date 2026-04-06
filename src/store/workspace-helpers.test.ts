import { describe, it, expect } from 'vitest'
import type { CanvasTerminalNode, MarkdownEditorNode, PerformerNode } from '../types'
import {
    normalizePath,
    getMaxPerformerCounter,
    getMaxMarkdownEditorCounter,
    applyPerformerPatch,
    mapPerformers,
    mapMarkdownEditors,
    removeMarkdownEditorsByDraftIds,
    mapCanvasTerminals,
    resolveCanvasSpawnPosition,
} from './workspace-helpers'

const performerFixture: PerformerNode = {
    id: 'p-1',
    name: 'Test',
    position: { x: 0, y: 0 },
    scope: 'shared',
    model: null,
    talRef: null,
    danceRefs: [],
    mcpServerNames: [],
    meta: { publishBindingUrn: 'urn:test' },
}

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

describe('resolveCanvasSpawnPosition', () => {
    it('centers a new window around the current canvas center', () => {
        expect(resolveCanvasSpawnPosition({
            canvasCenter: { x: 1000, y: 700 },
            existingCount: 0,
            width: 320,
            height: 400,
        })).toEqual({ x: 840, y: 500 })
    })

    it('applies a bounded stack offset for subsequent creations', () => {
        expect(resolveCanvasSpawnPosition({
            canvasCenter: { x: 1000, y: 700 },
            existingCount: 1,
            width: 320,
            height: 400,
        })).toEqual({ x: 876, y: 528 })

        expect(resolveCanvasSpawnPosition({
            canvasCenter: { x: 1000, y: 700 },
            existingCount: 6,
            width: 320,
            height: 400,
        })).toEqual({ x: 840, y: 500 })
    })

    it('falls back to a visible default position when canvas center is unavailable', () => {
        expect(resolveCanvasSpawnPosition({
            canvasCenter: null,
            existingCount: 0,
            width: 320,
            height: 400,
        })).toEqual({ x: 60, y: 60 })
    })
})

describe('applyPerformerPatch', () => {
    it('applies a simple name patch', () => {
        const result = applyPerformerPatch(performerFixture, { name: 'Renamed' })
        expect(result.name).toBe('Renamed')
    })

    it('resets publishBindingUrn when publish-identity fields change', () => {
        const result = applyPerformerPatch(performerFixture, { talRef: { kind: 'draft', draftId: 'tal-draft-1' } })
        expect(result.meta?.publishBindingUrn).toBeNull()
    })

    it('preserves publishBindingUrn for non-identity patches', () => {
        const result = applyPerformerPatch(performerFixture, { hidden: true })
        expect(result.meta?.publishBindingUrn).toBe('urn:test')
    })
})

describe('mapPerformers', () => {
    it('updates the targeted performer', () => {
        const performers: PerformerNode[] = [
            { ...performerFixture, id: 'p-1', name: 'A' },
            { ...performerFixture, id: 'p-2', name: 'B' },
        ]
        const result = mapPerformers(performers, 'p-1', (p) => ({ ...p, name: 'Updated' }))
        expect(result[0].name).toBe('Updated')
        expect(result[1].name).toBe('B')
    })

    it('returns unchanged array when ID not found', () => {
        const performers: PerformerNode[] = [{ ...performerFixture, id: 'p-1', name: 'A' }]
        const result = mapPerformers(performers, 'p-999', (p) => ({ ...p, name: 'X' }))
        expect(result[0].name).toBe('A')
    })
})

describe('mapMarkdownEditors', () => {
    it('updates the targeted editor', () => {
        const editors: MarkdownEditorNode[] = [
            {
                id: 'e-1',
                kind: 'tal',
                position: { x: 0, y: 0 },
                width: 560,
                height: 380,
                draftId: 'draft-1',
                baseline: { name: 'One', content: '' },
                attachTarget: null,
            },
            {
                id: 'e-2',
                kind: 'tal',
                position: { x: 0, y: 0 },
                width: 560,
                height: 380,
                draftId: 'draft-2',
                baseline: { name: 'Two', content: '' },
                attachTarget: null,
            },
        ]
        const result = mapMarkdownEditors(editors, 'e-2', (e) => ({
            ...e,
            baseline: e.baseline ? { ...e.baseline, content: 'new' } : e.baseline,
        }))
        expect(result[1].baseline?.content).toBe('new')
        expect(result[0].baseline?.content).toBe('')
    })
})

describe('mapCanvasTerminals', () => {
    it('updates the targeted terminal', () => {
        const terminals: CanvasTerminalNode[] = [
            { id: 't-1', title: 'T1', position: { x: 0, y: 0 }, width: 600, height: 400, sessionId: null, connected: false },
            { id: 't-2', title: 'T2', position: { x: 0, y: 0 }, width: 600, height: 400, sessionId: null, connected: false },
        ]
        const result = mapCanvasTerminals(terminals, 't-1', (t) => ({ ...t, sessionId: 'sess-1' }))
        expect(result[0].sessionId).toBe('sess-1')
    })
})

describe('removeMarkdownEditorsByDraftIds', () => {
    it('removes editors whose draft ids were deleted', () => {
        const editors: MarkdownEditorNode[] = [
            {
                id: 'e-1',
                kind: 'tal',
                position: { x: 0, y: 0 },
                width: 560,
                height: 380,
                draftId: 'draft-1',
                baseline: { name: 'One', content: '' },
                attachTarget: null,
            },
            {
                id: 'e-2',
                kind: 'dance',
                position: { x: 0, y: 0 },
                width: 560,
                height: 380,
                draftId: 'draft-2',
                baseline: { name: 'Two', content: '' },
                attachTarget: null,
            },
        ]

        expect(removeMarkdownEditorsByDraftIds(editors, ['draft-1']).map((editor) => editor.id)).toEqual(['e-2'])
        expect(removeMarkdownEditorsByDraftIds(editors, []).map((editor) => editor.id)).toEqual(['e-1', 'e-2'])
    })
})
