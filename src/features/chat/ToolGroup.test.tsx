import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ChatMessageToolInfo } from '../../types'

vi.mock('../../store/settingsSlice', () => ({
    useUISettings: (selector: (state: { shellToolPartsExpanded: boolean; editToolPartsExpanded: boolean }) => unknown) => selector({
        shellToolPartsExpanded: true,
        editToolPartsExpanded: true,
    }),
}))

vi.mock('../../components/chat/DiffChanges', () => ({
    DiffChanges: ({ changes }: { changes: { additions: number; deletions: number } }) => React.createElement(
        'mock-diff-changes',
        { 'data-additions': changes.additions, 'data-deletions': changes.deletions },
    ),
}))

vi.mock('../../components/chat/SyntaxBlock', () => ({
    SyntaxBlock: ({ code, language }: { code: string; language?: string }) => React.createElement(
        'mock-syntax-block',
        { 'data-language': language ?? '', 'data-code': code },
    ),
    DiffBlock: ({ before, after, filename, rawDiff }: { before: string; after: string; filename: string; rawDiff?: string }) => React.createElement(
        'mock-diff-block',
        { 'data-before': before, 'data-after': after, 'data-filename': filename, 'data-raw-diff': rawDiff ?? '' },
    ),
}))

import { ToolCallRow } from './ToolGroup'

function renderTool(tool: ChatMessageToolInfo) {
    return renderToStaticMarkup(React.createElement(ToolCallRow, { tool }))
}

describe('ToolCallRow', () => {
    it('renders single apply_patch metadata without repeating a file accordion header', () => {
        const html = renderTool({
            name: 'apply_patch',
            callId: 'call-1',
            status: 'completed',
            metadata: {
                files: [
                    {
                        filePath: '/tmp/example.ts',
                        relativePath: 'src/example.ts',
                        type: 'update',
                        before: 'const a = 1',
                        after: 'const a = 2',
                        additions: 1,
                        deletions: 1,
                    },
                ],
            },
        })

        expect(html).toContain('example.ts')
        expect(html).toContain('mock-diff-block')
        expect(html).toContain('data-before="const a = 1"')
        expect(html).toContain('data-after="const a = 2"')
        expect(html).not.toContain('tool-file-accordion')
    })

    it('uses shell metadata output when direct tool output is missing', () => {
        const html = renderTool({
            name: 'bash',
            callId: 'call-1',
            status: 'completed',
            input: {
                command: 'pwd',
                description: 'Check working directory',
            },
            metadata: {
                stdout: '/tmp/studio',
            },
        })

        expect(html).toContain('$ pwd')
        expect(html).toContain('/tmp/studio')
        expect(html).toContain('Check working directory')
    })

    it('avoids repeating the file accordion header for single write tools', () => {
        const html = renderTool({
            name: 'write',
            callId: 'call-1',
            status: 'completed',
            input: {
                filePath: 'src/example.ts',
                content: 'export const value = 1',
            },
        })

        expect(html).toContain('src/example.ts')
        expect(html).toContain('mock-syntax-block')
        expect(html).not.toContain('tool-file-accordion')
    })

    it('renders multi-file patch metadata with raw diffs inside the expanded rows', () => {
        const html = renderTool({
            name: 'apply_patch',
            callId: 'call-2',
            status: 'completed',
            metadata: {
                files: [
                    {
                        filePath: '/tmp/example.ts',
                        relativePath: 'src/example.ts',
                        type: 'update',
                        diff: '@@ -1 +1 @@\n-const a = 1\n+const a = 2',
                        additions: 1,
                        deletions: 1,
                    },
                ],
            },
        })

        expect(html).toContain('mock-diff-block')
        expect(html).toContain('data-raw-diff="@@ -1 +1 @@')
    })
})
