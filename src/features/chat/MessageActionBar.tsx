import { useState } from 'react'
import { Copy, Check, CornerDownLeft } from 'lucide-react'
import type { ChatMessage } from '../../types'
import './MessageActionBar.css'

type MessageActionBarProps = {
    message: ChatMessage
    performerId: string
    canRevert: boolean
    onRevert: (performerId: string, messageId: string) => void
}

function shortenModelId(modelId: string): string {
    return modelId.replace(/-\d{8}$/, '')
}

function MetadataBadge({ metadata }: { metadata: NonNullable<ChatMessage['metadata']> }) {
    const parts: string[] = []
    if (metadata.modelId) {
        parts.push(shortenModelId(metadata.modelId))
    }
    if (metadata.variant) {
        parts.push(metadata.variant)
    }
    if (parts.length === 0) return null

    const title = [
        metadata.provider && metadata.modelId ? `Model: ${metadata.provider}/${metadata.modelId}` : null,
        metadata.variant ? `Variant: ${metadata.variant}` : null,
    ].filter(Boolean).join('\n')

    return (
        <span className="msg-action__metadata" title={title}>
            {parts.join(' · ')}
        </span>
    )
}

export default function MessageActionBar({
    message,
    performerId,
    canRevert,
    onRevert,
}: MessageActionBarProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            // Fallback for insecure context
            const textarea = document.createElement('textarea')
            textarea.value = message.content
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        }
    }

    const showRevert = canRevert && message.role === 'user'

    return (
        <div className="msg-action-bar">
            {message.metadata ? <MetadataBadge metadata={message.metadata} /> : null}
            <div className="msg-action-bar__actions">
                <button
                    className="msg-action-btn"
                    onClick={handleCopy}
                    title={copied ? 'Copied!' : 'Copy message'}
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
                {showRevert ? (
                    <button
                        className="msg-action-btn"
                        onClick={() => onRevert(performerId, message.id)}
                        title="Revert to this message"
                    >
                        <CornerDownLeft size={12} />
                    </button>
                ) : null}
            </div>
        </div>
    )
}
