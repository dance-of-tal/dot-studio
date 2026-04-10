import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DiffBlock } from './SyntaxBlock'

function renderDiff(props: React.ComponentProps<typeof DiffBlock>) {
    return renderToStaticMarkup(React.createElement(DiffBlock, props))
}

function stripMarkup(html: string) {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('DiffBlock', () => {
    it('renders unified diff replacements as removed and added rows in a single panel', () => {
        const html = renderDiff({
            before: '',
            after: '',
            filename: 'src/example.ts',
            rawDiff: [
                '--- a/src/example.ts',
                '+++ b/src/example.ts',
                '@@ -1,2 +1,2 @@',
                '-const value = 1',
                '+const value = 2',
                ' const keep = true',
            ].join('\n'),
        })
        const text = stripMarkup(html)

        expect(html).toContain('data-type="removed"')
        expect(html).toContain('data-type="added"')
        expect(text).toContain('const value = 1')
        expect(text).toContain('const value = 2')
        expect(html).toContain('diff-block__marker')
        expect(html).not.toContain('diff-block__desktop')
        expect(text).not.toContain('@@ -1,2 +1,2 @@')
    })

    it('supports hunk-only diffs by synthesizing the missing patch headers', () => {
        const html = renderDiff({
            before: '',
            after: '',
            filename: 'src/example.ts',
            rawDiff: '@@ -1 +1 @@\n-old\n+new',
        })
        const text = stripMarkup(html)

        expect(html).toContain('data-type="removed"')
        expect(html).toContain('data-type="added"')
        expect(text).toContain('old')
        expect(text).toContain('new')
    })

    it('pairs before/after middle sections as modified rows', () => {
        const html = renderDiff({
            before: ['const keep = true', 'const value = 1'].join('\n'),
            after: ['const keep = true', 'const value = 2'].join('\n'),
            filename: 'src/example.ts',
        })
        const text = stripMarkup(html)

        expect(html).toContain('data-type="removed"')
        expect(html).toContain('data-type="added"')
        expect(html).toContain('data-type="unchanged"')
        expect(text).toContain('const keep = true')
        expect(text).toContain('const value = 1')
        expect(text).toContain('const value = 2')
    })
})
