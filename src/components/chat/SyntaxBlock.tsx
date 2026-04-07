import { useMemo } from 'react'
import hljs from 'highlight.js/lib/core'

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

type DiffViewLine = {
    kind: 'context' | 'add' | 'delete' | 'meta'
    marker: string
    text: string
    oldLine: number | null
    newLine: number | null
}

function splitContentLines(content: string): string[] {
    return content === '' ? [] : content.split('\n')
}

function buildDiffLinesFromContent(before: string, after: string): DiffViewLine[] {
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

    const rows: DiffViewLine[] = []
    let oldLine = 1
    let newLine = 1

    for (let index = 0; index < prefix; index += 1) {
        rows.push({
            kind: 'context',
            marker: ' ',
            text: beforeLines[index] ?? '',
            oldLine,
            newLine,
        })
        oldLine += 1
        newLine += 1
    }

    const beforeMiddle = beforeLines.slice(prefix, beforeLines.length - suffix)
    const afterMiddle = afterLines.slice(prefix, afterLines.length - suffix)

    for (const line of beforeMiddle) {
        rows.push({
            kind: 'delete',
            marker: '-',
            text: line,
            oldLine,
            newLine: null,
        })
        oldLine += 1
    }

    for (const line of afterMiddle) {
        rows.push({
            kind: 'add',
            marker: '+',
            text: line,
            oldLine: null,
            newLine,
        })
        newLine += 1
    }

    const suffixStartBefore = beforeLines.length - suffix
    for (let index = 0; index < suffix; index += 1) {
        rows.push({
            kind: 'context',
            marker: ' ',
            text: beforeLines[suffixStartBefore + index] ?? '',
            oldLine,
            newLine,
        })
        oldLine += 1
        newLine += 1
    }

    return rows
}

function buildDiffLinesFromRawDiff(rawDiff: string): DiffViewLine[] {
    const rows: DiffViewLine[] = []
    const lines = rawDiff.split('\n')
    let oldLine = 0
    let newLine = 0
    let hasHunk = false

    for (const line of lines) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (hunkMatch) {
            oldLine = Number(hunkMatch[1])
            newLine = Number(hunkMatch[2])
            hasHunk = true
            rows.push({
                kind: 'meta',
                marker: '@',
                text: line,
                oldLine: null,
                newLine: null,
            })
            continue
        }

        if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('\\')) {
            rows.push({
                kind: 'meta',
                marker: '·',
                text: line,
                oldLine: null,
                newLine: null,
            })
            continue
        }

        if (!hasHunk) {
            rows.push({
                kind: 'meta',
                marker: '·',
                text: line,
                oldLine: null,
                newLine: null,
            })
            continue
        }

        if (line.startsWith('+')) {
            rows.push({
                kind: 'add',
                marker: '+',
                text: line.slice(1),
                oldLine: null,
                newLine,
            })
            newLine += 1
            continue
        }

        if (line.startsWith('-')) {
            rows.push({
                kind: 'delete',
                marker: '-',
                text: line.slice(1),
                oldLine,
                newLine: null,
            })
            oldLine += 1
            continue
        }

        rows.push({
            kind: 'context',
            marker: ' ',
            text: line.startsWith(' ') ? line.slice(1) : line,
            oldLine,
            newLine,
        })
        oldLine += 1
        newLine += 1
    }

    return rows
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

    const rows = useMemo(() => {
        if (rawDiff) {
            return buildDiffLinesFromRawDiff(rawDiff)
        }
        return buildDiffLinesFromContent(before, after)
    }, [after, before, rawDiff])

    return (
        <div className="diff-block" style={{ maxHeight: `${maxHeight}px` }} data-scrollable>
            <div className="diff-block__rows">
                {rows.map((row, index) => (
                    <div key={`${row.kind}:${row.oldLine ?? 'x'}:${row.newLine ?? 'x'}:${index}`} className="diff-block__row" data-kind={row.kind}>
                        <span className="diff-block__line-num">{row.oldLine ?? ''}</span>
                        <span className="diff-block__line-num">{row.newLine ?? ''}</span>
                        <span className="diff-block__marker">{row.marker}</span>
                        <span className="diff-block__text">{row.text || ' '}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
