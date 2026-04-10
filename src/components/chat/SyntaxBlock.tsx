import { useMemo } from 'react'
import hljs from 'highlight.js/lib/core'
import { parsePatch } from 'diff'

// Register commonly used languages
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import diff from 'highlight.js/lib/languages/diff'

import './SyntaxBlock.css'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('diff', diff)

// Aliases
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('py', python)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('zsh', bash)
hljs.registerLanguage('cs', csharp)

/** Detect language from file extension */
function langFromFilename(filename: string): string | undefined {
    if (!filename) return undefined
    const ext = filename.split('.').pop()?.toLowerCase()
    if (!ext) return undefined
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        py: 'python', css: 'css', json: 'json', html: 'xml', xml: 'xml', svg: 'xml',
        sh: 'bash', bash: 'bash', zsh: 'bash',
        md: 'markdown', yaml: 'yaml', yml: 'yaml',
        sql: 'sql', go: 'go', rs: 'rust',
        java: 'java', cs: 'csharp',
        diff: 'diff', patch: 'diff',
    }
    return map[ext]
}

interface SyntaxBlockProps {
    /** Code content */
    code: string
    /** Explicit language (overrides filename detection) */
    language?: string
    /** Filename for language detection and display */
    filename?: string
    /** Show line numbers */
    lineNumbers?: boolean
    /** Max height before scroll */
    maxHeight?: number
    /** Style variant */
    variant?: 'default' | 'diff-old' | 'diff-new'
}

/**
 * Syntax-highlighted code block using highlight.js.
 * Reuses the same github-dark theme already loaded by MarkdownRenderer.
 */
export function SyntaxBlock({
    code,
    language,
    filename,
    lineNumbers = true,
    maxHeight = 400,
    variant = 'default',
}: SyntaxBlockProps) {
    const lang = language || langFromFilename(filename || '')
    const highlighted = useMemo(() => {
        if (!code) return ''
        try {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value
            }
            const result = hljs.highlightAuto(code)
            return result.value
        } catch {
            return escapeHtml(code)
        }
    }, [code, lang])

    const lines = useMemo(() => code.split('\n'), [code])

    return (
        <div
            className={`syntax-block syntax-block--${variant}`}
            style={{ maxHeight: `${maxHeight}px` }}
            data-scrollable
        >
            <pre className="syntax-block__pre">
                {lineNumbers && (
                    <span className="syntax-block__gutter" aria-hidden="true">
                        {lines.map((_, i) => (
                            <span key={i} className="syntax-block__line-num">{i + 1}</span>
                        ))}
                    </span>
                )}
                <code
                    className={`syntax-block__code hljs${lang ? ` language-${lang}` : ''}`}
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                />
            </pre>
        </div>
    )
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

type DiffRow = {
    left: string
    right: string
    type: 'added' | 'removed' | 'unchanged' | 'modified'
}

type UnifiedDiffRow = {
    content: string
    type: 'added' | 'removed' | 'unchanged'
}

function splitContentLines(content: string): string[] {
    return content === '' ? [] : content.split('\n')
}

function normalizeDiffLineContent(content: string) {
    return content === '' ? ' ' : content
}

function buildDiffRowsFromContent(before: string, after: string): DiffRow[] {
    const beforeLines = splitContentLines(before)
    const afterLines = splitContentLines(after)

    let prefix = 0
    while (
        prefix < beforeLines.length
        && prefix < afterLines.length
        && beforeLines[prefix] === afterLines[prefix]
    ) {
        prefix += 1
    }

    let suffix = 0
    while (
        suffix < beforeLines.length - prefix
        && suffix < afterLines.length - prefix
        && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
    ) {
        suffix += 1
    }

    const rows: DiffRow[] = []

    for (let index = 0; index < prefix; index += 1) {
        rows.push({
            left: normalizeDiffLineContent(beforeLines[index] ?? ''),
            right: normalizeDiffLineContent(beforeLines[index] ?? ''),
            type: 'unchanged',
        })
    }

    const beforeMiddle = beforeLines.slice(prefix, beforeLines.length - suffix)
    const afterMiddle = afterLines.slice(prefix, afterLines.length - suffix)

    const middleLength = Math.max(beforeMiddle.length, afterMiddle.length)
    for (let index = 0; index < middleLength; index += 1) {
        const left = beforeMiddle[index]
        const right = afterMiddle[index]

        if (left !== undefined && right !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: normalizeDiffLineContent(right),
                type: 'modified',
            })
            continue
        }

        if (left !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: '',
                type: 'removed',
            })
            continue
        }

        if (right !== undefined) {
            rows.push({
                left: '',
                right: normalizeDiffLineContent(right),
                type: 'added',
            })
        }
    }

    for (let index = 0; index < suffix; index += 1) {
        rows.push({
            left: normalizeDiffLineContent(beforeLines[beforeLines.length - suffix + index] ?? ''),
            right: normalizeDiffLineContent(beforeLines[beforeLines.length - suffix + index] ?? ''),
            type: 'unchanged',
        })
    }

    return rows
}

function pairDiffGroup(lines: string[], startIndex: number) {
    const removals: string[] = [lines[startIndex].slice(1)]
    let cursor = startIndex + 1

    while (cursor < lines.length && lines[cursor]?.startsWith('-')) {
        removals.push(lines[cursor].slice(1))
        cursor += 1
    }

    const additions: string[] = []
    while (cursor < lines.length && lines[cursor]?.startsWith('+')) {
        additions.push(lines[cursor].slice(1))
        cursor += 1
    }

    const rows: DiffRow[] = []
    const size = Math.max(removals.length, additions.length)
    for (let index = 0; index < size; index += 1) {
        const left = removals[index]
        const right = additions[index]

        if (left !== undefined && right !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: normalizeDiffLineContent(right),
                type: 'modified',
            })
            continue
        }

        if (left !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: '',
                type: 'removed',
            })
            continue
        }

        if (right !== undefined) {
            rows.push({
                left: '',
                right: normalizeDiffLineContent(right),
                type: 'added',
            })
        }
    }

    return { rows, nextIndex: cursor }
}

function buildDiffRowsFromLoosePatch(rawDiff: string): DiffRow[] {
    const rows: DiffRow[] = []
    const lines = rawDiff.split('\n')
    let inHunk = false

    for (let index = 0; index < lines.length; ) {
        const line = lines[index] ?? ''
        if (line.startsWith('@@')) {
            inHunk = true
            index += 1
            continue
        }

        if (!inHunk || line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('\\')) {
            index += 1
            continue
        }

        if (line.startsWith('-')) {
            const paired = pairDiffGroup(lines, index)
            rows.push(...paired.rows)
            index = paired.nextIndex
            continue
        }

        if (line.startsWith('+')) {
            rows.push({
                left: '',
                right: normalizeDiffLineContent(line.slice(1)),
                type: 'added',
            })
            index += 1
            continue
        }

        rows.push({
            left: normalizeDiffLineContent(line.startsWith(' ') ? line.slice(1) : line),
            right: normalizeDiffLineContent(line.startsWith(' ') ? line.slice(1) : line),
            type: 'unchanged',
        })
        index += 1
    }

    return rows
}

function ensurePatchHeaders(rawDiff: string, filename?: string) {
    if (!rawDiff.includes('@@') || rawDiff.includes('--- ') || rawDiff.includes('+++ ')) {
        return rawDiff
    }

    const safeFilename = (filename || 'file').replace(/^\/+/, '')
    return [`--- a/${safeFilename}`, `+++ b/${safeFilename}`, rawDiff].join('\n')
}

function buildDiffRowsFromRawDiff(rawDiff: string, filename?: string): DiffRow[] {
    const patchText = ensurePatchHeaders(rawDiff, filename)

    try {
        const patches = parsePatch(patchText)
        const rows: DiffRow[] = []

        for (const patch of patches) {
            for (const hunk of patch.hunks ?? []) {
                const lines = hunk.lines ?? []
                for (let index = 0; index < lines.length; ) {
                    const line = lines[index] ?? ''
                    const prefix = line[0]
                    const content = line.slice(1)

                    if (prefix === '-') {
                        const paired = pairDiffGroup(lines, index)
                        rows.push(...paired.rows)
                        index = paired.nextIndex
                        continue
                    }

                    if (prefix === '+') {
                        rows.push({
                            left: '',
                            right: normalizeDiffLineContent(content),
                            type: 'added',
                        })
                        index += 1
                        continue
                    }

                    if (prefix === ' ') {
                        rows.push({
                            left: normalizeDiffLineContent(content),
                            right: normalizeDiffLineContent(content),
                            type: 'unchanged',
                        })
                        index += 1
                        continue
                    }

                    index += 1
                }
            }
        }

        if (rows.length > 0) {
            return rows
        }
    } catch (error) {
        console.error('Failed to parse patch:', error)
    }

    return buildDiffRowsFromLoosePatch(rawDiff)
}

function buildUnifiedDiffRows(rows: DiffRow[]): UnifiedDiffRow[] {
    return rows.reduce<UnifiedDiffRow[]>((result, row) => {
        if (row.type === 'modified') {
            result.push(
                { content: row.left, type: 'removed' as const },
                { content: row.right, type: 'added' as const },
            )
            return result
        }

        if (row.type === 'removed') {
            result.push({ content: row.left, type: 'removed' as const })
            return result
        }

        if (row.type === 'added') {
            result.push({ content: row.right, type: 'added' as const })
            return result
        }

        result.push({ content: row.left, type: 'unchanged' as const })
        return result
    }, [])
}

function highlightDiffCell(content: string, lang?: string) {
    if (!content) return '&nbsp;'
    if (content === ' ') return ' '
    try {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(content, { language: lang }).value
        }
    } catch {
        // Fall through to plain escaped text when line-level highlighting fails.
    }
    return escapeHtml(content)
}

/**
 * Inline diff view: unified, IDE-like diff viewer for either raw patches or before/after content.
 */
export function DiffBlock(props: {
    before: string
    after: string
    filename?: string
    rawDiff?: string
    maxHeight?: number
}) {
    const {
        before,
        after,
        rawDiff,
        maxHeight = 400,
    } = props

    const lang = langFromFilename(props.filename || '')
    const rows = useMemo(() => {
        if (rawDiff) {
            return buildDiffRowsFromRawDiff(rawDiff, props.filename)
        }
        return buildDiffRowsFromContent(before, after)
    }, [after, before, props.filename, rawDiff])
    const unifiedRows = useMemo(() => buildUnifiedDiffRows(rows), [rows])

    return (
        <div className="diff-block" style={{ maxHeight: `${maxHeight}px` }} data-scrollable>
            {unifiedRows.map((row, index) => (
                <div
                    key={`${row.type}:${index}:${row.content}`}
                    className="diff-block__row"
                    data-diff-type={row.type === 'unchanged' ? undefined : row.type}
                    data-type={row.type}
                >
                    <span className="diff-block__marker" aria-hidden="true">
                        {row.type === 'removed' ? '-' : row.type === 'added' ? '+' : ' '}
                    </span>
                    <code
                        className={`diff-block__code hljs${lang ? ` language-${lang}` : ''}`}
                        dangerouslySetInnerHTML={{ __html: highlightDiffCell(row.content, lang) }}
                    />
                </div>
            ))}
        </div>
    )
}
