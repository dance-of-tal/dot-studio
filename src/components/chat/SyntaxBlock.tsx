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

/**
 * Inline diff view: side-by-side or unified diff of before/after
 */
export function DiffBlock({
    before,
    after,
    filename,
    maxHeight = 400,
}: {
    before: string
    after: string
    filename?: string
    maxHeight?: number
}) {
    const lang = langFromFilename(filename || '')

    return (
        <div className="diff-block" style={{ maxHeight: `${maxHeight}px` }} data-scrollable>
            {before && (
                <div className="diff-block__section diff-block__section--old">
                    <div className="diff-block__section-label">Before</div>
                    <SyntaxBlock code={before} language={lang} lineNumbers={false} maxHeight={1e6} variant="diff-old" />
                </div>
            )}
            {after && (
                <div className="diff-block__section diff-block__section--new">
                    <div className="diff-block__section-label">After</div>
                    <SyntaxBlock code={after} language={lang} lineNumbers={false} maxHeight={1e6} variant="diff-new" />
                </div>
            )}
        </div>
    )
}
