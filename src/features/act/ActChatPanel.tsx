/**
 * ActChatPanel — Chat mode for Act nodes.
 *
 * Simpler than PerformerChatPanel: shows Act-scoped messages with performer labels,
 * a caller selector dropdown, and a basic composer.
 * Safe mode hides revert/undo (Act sessions are multi-performer).
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Zap } from 'lucide-react'
import { useStudioStore } from '../../store'
import ThreadBody from '../chat/ThreadBody'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import './ActChatPanel.css'

type ActChatMessage = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: number
    performerName?: string
}

export default function ActChatPanel({ actId }: { actId: string }) {
    const {
        acts, actChats, loadingPerformerId,
        sendActMessage,
    } = useStudioStore()

    const act = acts.find((a) => a.id === actId)
    const messages: ActChatMessage[] = actChats[actId] || []

    const performerEntries = act ? Object.entries(act.performers) : []
    const [callerId, setCallerId] = useState<string | null>(
        performerEntries.length > 0 ? performerEntries[0][0] : null,
    )
    const [input, setInput] = useState('')
    const chatEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Auto-select first performer if current selection removed
    useEffect(() => {
        if (callerId && act?.performers[callerId]) return
        const keys = Object.keys(act?.performers || {})
        setCallerId(keys.length > 0 ? keys[0] : null)
    }, [act?.performers, callerId])

    // Auto-scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length])

    const handleSend = useCallback(() => {
        if (!input.trim() || !callerId || !act) return
        sendActMessage(actId, callerId, input.trim())
        setInput('')
        inputRef.current?.focus()
    }, [actId, callerId, input, act, sendActMessage])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }, [handleSend])

    if (!act) return null

    const isLoading = performerEntries.some(([key]) => loadingPerformerId === key)
    const callerName = callerId ? act.performers[callerId]?.name : null

    return (
        <div className="act-chat">
            <ThreadBody
                messages={messages}
                loading={isLoading}
                renderMessage={(msg, index) => (
                    <div key={msg.id || index} className={`act-chat__msg act-chat__msg--${msg.role}`}>
                        {msg.role === 'assistant' && msg.performerName && (
                            <div className="act-chat__performer-label">
                                <Zap size={9} />
                                <span>{msg.performerName}</span>
                            </div>
                        )}
                        <div className="act-chat__content">
                            {msg.role === 'system' ? (
                                <div className="act-chat__system">{msg.content}</div>
                            ) : (
                                <MarkdownRenderer content={msg.content} />
                            )}
                        </div>
                    </div>
                )}
                renderEmpty={() => (
                    <div className="act-chat__empty">
                        <Zap size={16} />
                        <span>Send a message to start the Act conversation</span>
                    </div>
                )}
                renderLoading={() => (
                    <div className="act-chat__loading">
                        <span className="act-chat__dot-pulse" />
                    </div>
                )}
                endRef={chatEndRef}
                composer={
                    <div className="act-chat__composer">
                        <select
                            className="act-chat__caller-select"
                            value={callerId || ''}
                            onChange={(e) => setCallerId(e.target.value || null)}
                            title="Select calling performer"
                        >
                            {performerEntries.length === 0 && (
                                <option value="">No performers</option>
                            )}
                            {performerEntries.map(([key, p]) => (
                                <option key={key} value={key}>{p.name}</option>
                            ))}
                        </select>
                        <div className="act-chat__input-row">
                            <textarea
                                ref={inputRef}
                                className="act-chat__input"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={callerName ? `Message as ${callerName}…` : 'Select a performer first…'}
                                rows={1}
                                disabled={!callerId || isLoading}
                            />
                            <button
                                className="act-chat__send-btn"
                                onClick={handleSend}
                                disabled={!input.trim() || !callerId || isLoading}
                                title="Send"
                            >
                                <Send size={12} />
                            </button>
                        </div>
                    </div>
                }
            />
        </div>
    )
}
