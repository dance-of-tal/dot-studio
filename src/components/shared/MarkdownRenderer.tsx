import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useState, useCallback } from 'react';
import { Check, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import 'highlight.js/styles/github-dark.min.css';

interface MarkdownRendererProps {
    content: string;
}

/** Separate thinking/reasoning text from the actual response */
function splitThinking(content: string): { thinking: string | null; response: string } {
    // Only detect explicit <think>...</think> tags (DeepSeek/Claude style)
    const thinkMatch = content.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
    if (thinkMatch) {
        return { thinking: thinkMatch[1].trim(), response: thinkMatch[2].trim() };
    }

    return { thinking: null, response: content };
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [text]);

    return (
        <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
            {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
    );
}

function ThinkingBlock({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="thinking-block">
            <button
                className="thinking-toggle"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="thinking-label">Thinking</span>
                {!expanded && (
                    <span className="thinking-preview">
                        {content.slice(0, 60)}…
                    </span>
                )}
            </button>
            {expanded && (
                <div className="thinking-content">
                    {content}
                </div>
            )}
        </div>
    );
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
    const { thinking, response } = splitThinking(content);

    return (
        <div className="md-renderer">
            {thinking && <ThinkingBlock content={thinking} />}
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                    pre({ children, ...props }) {
                        // Extract code text for copy button
                        const codeEl = (children as any)?.props;
                        const codeText = codeEl?.children?.[0] || '';
                        const rawClass = codeEl?.className || '';
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
        </div>
    );
}
