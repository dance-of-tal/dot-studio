/* eslint-disable react-refresh/only-export-components */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { memo, useState, useCallback, Children, isValidElement, useEffect } from 'react';
import { Check, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import 'highlight.js/styles/github-dark.min.css';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
    content: string
    showThinking?: boolean
    streaming?: boolean
}

type CodeElementProps = {
    children?: unknown
    className?: string
}

function toCodeText(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    if (Array.isArray(value)) return value.map((item) => toCodeText(item)).join('')
    return ''
}

function formatThinkingText(content: string): string {
    return content
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/#+\s*/g, '')
        .replace(/`/g, '')
        .replace(/\n+/g, ' ')
        .trim()
}

/** Separate thinking/reasoning text from the actual response */
export function splitThinking(
    content: string,
    options: { streaming?: boolean } = {},
): { thinking: string | null; response: string } {
    // Detect a leading <think> block even if there is leading whitespace or tag attributes.
    const thinkMatch = content.match(/^\s*<think(?:\s[^>]*)?>([\s\S]*?)<\/think>\s*([\s\S]*)$/i)
    if (thinkMatch) {
        return { thinking: thinkMatch[1].trim(), response: thinkMatch[2].trim() }
    }

    if (options.streaming) {
        const partialThinkMatch = content.match(/^\s*<think(?:\s[^>]*)?>([\s\S]*)$/i)
        if (partialThinkMatch) {
            return { thinking: partialThinkMatch[1].trimStart(), response: '' }
        }
    }

    return { thinking: null, response: content }
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [text])

    return (
        <button className="code-copy-btn" onClick={handleCopy} title="Copy code" type="button">
            {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
    )
}

function ThinkingBlock({ content, streaming = false }: { content: string; streaming?: boolean }) {
    const [expanded, setExpanded] = useState(streaming)
    const thinkingText = formatThinkingText(content)
    const preview = thinkingText.slice(0, 200)

    useEffect(() => {
        setExpanded(streaming)
    }, [streaming])

    const handleToggle = useCallback(() => {
        if (streaming) return
        setExpanded((current) => !current)
    }, [streaming])

    return (
        <div className="thinking-row">
            <button
                className="thinking-row__header"
                onClick={handleToggle}
                type="button"
            >
                <span className="thinking-row__chevron">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="thinking-row__label">Thinking</span>
                {(expanded ? thinkingText : preview) && (
                    <span className={`thinking-row__preview${expanded ? ' thinking-row__preview--expanded' : ''}`}>
                        {expanded ? thinkingText : preview}
                        {!expanded && thinkingText.length > 200 ? '…' : ''}
                    </span>
                )}
            </button>
        </div>
    )
}

function StreamingMarkdown({ content }: { content: string }) {
    const blocks = content.split(/\n{2,}/).filter((block) => block.trim())
    if (blocks.length === 0) {
        return null
    }

    return (
        <>
            {blocks.map((block, index) => (
                <p key={`${index}:${block.slice(0, 24)}`} className="md-renderer__streaming-block">
                    {block}
                </p>
            ))}
        </>
    )
}

function MarkdownRenderer({ content, showThinking = true, streaming = false }: MarkdownRendererProps) {
    const { thinking, response } = splitThinking(content, { streaming })
    const visibleThinking = showThinking ? thinking : null

    return (
        <div className={`md-renderer${streaming ? ' md-renderer--streaming' : ''}`}>
            {visibleThinking && <ThinkingBlock content={visibleThinking} streaming={streaming} />}
            {streaming ? (
                <StreamingMarkdown content={response} />
            ) : (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                        pre({ children, ...props }) {
                            // Extract code text for copy button
                            const codeChild = Children.toArray(children)[0]
                            const codeEl = isValidElement<CodeElementProps>(codeChild) ? codeChild : null
                            const codeText = toCodeText(codeEl?.props.children)
                            const rawClass = codeEl?.props.className || '';
                            const lang = rawClass.replace(/language-/g, '').replace(/hljs\s*/g, '').trim();

                            return (
                                <div className="code-block-wrapper">
                                    <div className="code-block-header">
                                        <span className="code-lang">{lang || 'code'}</span>
                                        <CopyButton text={String(codeText)} />
                                    </div>
                                    <pre {...props}>{children}</pre>
                                </div>
                            );
                        },
                        code({ className, children, ...props }) {
                            const isInline = !className;
                            if (isInline) {
                                return <code className="inline-code" {...props}>{children}</code>;
                            }
                            return <code className={className} {...props}>{children}</code>;
                        },
                        a({ href, children, ...props }) {
                            return (
                                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                                    {children}
                                </a>
                            );
                        }
                    }}
                >
                    {response}
                </ReactMarkdown>
            )}
        </div>
    )
}

export default memo(MarkdownRenderer, (prev, next) => (
    prev.content === next.content
    && prev.showThinking === next.showThinking
    && prev.streaming === next.streaming
))
