import { useState } from 'react'
import { Copy, Check, CornerDownLeft, ArrowLeft } from 'lucide-react'
import type { ChatMessage } from '../../types'
import './MessageActionBar.css'

type MessageActionBarProps = {
    message: ChatMessage
    performerId: string
    isLastMessage: boolean
    canUndo: boolean
    canRevert: boolean
    isLoading: boolean
    onUndo: (performerId: string) => void
    onRevert: (performerId: string, messageId: string) => void
}

function MetadataBadge({ metadata }: { metadata: NonNullable<ChatMessage['metadata']> }) {
    const parts: string[] = []
    if (metadata.agentName) {
        parts.push(metadata.agentName.charAt(0).toUpperCase() + metadata.agentName.slice(1))
    }
    if (metadata.modelId) {
        // Shorten model name: "claude-sonnet-4-20250514" → "claude-sonnet-4"
        const short = metadata.modelId.replace(/-\d{8}$/, '')
        parts.push(short)
    }
    if (metadata.variant) {
        parts.push(metadata.variant)
    }
    if (parts.length === 0) return null

    const title = [
        metadata.agentName ? `Agent: ${metadata.agentName}` : null,
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
    isLastMessage,
    canUndo,
    canRevert,
    isLoading,
    onUndo,
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

    const showUndo = isLastMessage && canUndo && !isLoading
    const showRevert = canRevert && !isLastMessage && !isLoading && message.role === 'user'

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
                {showUndo ? (
                    <button
                        className="msg-action-btn msg-action-btn--undo"
                        onClick={() => onUndo(performerId)}
                        title="Undo last turn"
                    >
                        <ArrowLeft size={12} />
                    </button>
                ) : null}
            </div>
        </div>
    )
}
