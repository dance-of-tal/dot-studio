/**
 * ActChatPanel — Chat mode for Act canvas node.
 *
 * Uses the entry performer's Act-namespaced session for messaging.
 * Session key: `act:{actId}:{entryKey}` — isolated from standalone performer sessions.
 * Includes per-performer filter tabs to show messages by performer.
 */
import { useState, useCallback, useMemo, useRef } from 'react'
import { Send, Square, Zap, Users } from 'lucide-react'
import { useStudioStore } from '../../store'
import { hasModelConfig } from '../../lib/performers'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import type { ChatMessage } from '../../types'
import './ActChatPanel.css'

interface ActChatPanelProps {
    actId: string
}

export default function ActChatPanel({ actId }: ActChatPanelProps) {
    const {
        acts, chats, loadingPerformerId, sendActMessage, abortChat,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === actId), [acts, actId])
    const [input, setInput] = useState('')
    const [filter, setFilter] = useState<string | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Use first performer key as default entry (choreography model has no entryPerformerKey)
    const entryKey = act ? Object.keys(act.performers)[0] : null
    const entryPerformer = entryKey ? act?.performers[entryKey] : null

    // Namespaced chat key matching chatSlice convention
    const chatKey = entryKey ? `act:${actId}:${entryKey}` : null

    // Messages from the Act's namespaced session
    const allMessages: ChatMessage[] = useMemo(() => {
        if (!chatKey) return []
        return chats[chatKey] || []
    }, [chats, chatKey])

    // Filter messages by performer (agent name in metadata)
    const messages = useMemo(() => {
        if (!filter) return allMessages
        return allMessages.filter((m) => {
            if (m.role === 'system') return true
            if (m.role === 'user') return filter === entryKey
            // Assistant messages — match by metadata.agentName
            return m.metadata?.agentName === filter
        })
    }, [allMessages, filter, entryKey])

    const isLoading = chatKey ? loadingPerformerId === chatKey : false

    // In choreography model, resolve performer model from standalone performers by ref
    const resolvedPerformer = (() => {
        if (!entryPerformer) return null
        const ref = entryPerformer.performerRef
        if (ref.kind === 'draft') {
            return useStudioStore.getState().performers.find((p) => p.id === ref.draftId) || null
        } else {
            return useStudioStore.getState().performers.find((p) => p.meta?.derivedFrom === ref.urn) || null
        }
    })()
    const entryModel = resolvedPerformer?.model || null
    const modelConfigured = hasModelConfig(entryModel)

    const handleSend = useCallback(() => {
        if (!input.trim() || isLoading || !entryKey || !modelConfigured) return
        const text = input.trim()
        setInput('')
        sendActMessage(actId, entryKey, text)
    }, [input, isLoading, entryKey, modelConfigured, sendActMessage, actId])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }, [handleSend])

    if (!act) return null

    const noEntry = !entryKey || !entryPerformer
    const performerKeys = Object.keys(act.performers)
    const showFilters = performerKeys.length > 1

    return (
        <div className="act-chat">
            {/* Performer Filter Tabs */}
            {showFilters && (
                <div className="act-chat__filters">
                    <button
                        className={`act-chat__filter-tab ${filter === null ? 'act-chat__filter-tab--active' : ''}`}
                        onClick={() => setFilter(null)}
                    >
                        <Users size={10} /> All
                    </button>
                    {performerKeys.map((key) => (
                        <button
                            key={key}
                            className={`act-chat__filter-tab ${filter === key ? 'act-chat__filter-tab--active' : ''}`}
                            onClick={() => setFilter(filter === key ? null : key)}
                        >
                            {key === entryKey && <Zap size={9} />}
                            {key}
                        </button>
                    ))}
                </div>
            )}

            {/* Thread */}
            <ThreadBody
                messages={messages}
                loading={isLoading}
                renderMessage={(msg, index) => (
                    <div key={msg.id || index} className={`thread-msg thread-msg--${msg.role}`}>
                        {msg.role === 'user' ? (
                            <div className="user-input-box">
                                <span className="user-input-text">{msg.content}</span>
                            </div>
                        ) : msg.role === 'system' ? (
                            <div className="act-chat__system">{msg.content}</div>
                        ) : (
                            <ChatMessageContent message={msg} />
                        )}
                    </div>
                )}
                renderEmpty={() => (
                    <div className="act-chat__empty">
                        {noEntry ? (
                            <>
                                <Zap size={16} />
                                <span>Add performers to start</span>
                            </>
                        ) : !modelConfigured ? (
                            <>
                                <Zap size={16} />
                                <span>Configure a model for the entry performer</span>
                            </>
                        ) : (
                            <>
                                <Zap size={16} />
                                <span>Send a message to start the Act</span>
                            </>
                        )}
                    </div>
                )}
                renderLoading={() => (
                    <div className="thread-msg thread-msg--assistant">
                        <div className="assistant-body">
                            <div className="loading-dots">
                                <span /><span /><span />
                            </div>
                        </div>
                    </div>
                )}
                endRef={chatEndRef}
                composer={
                    <div className="chat-input">
                        <div className="chat-input__main">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => {
                                    setInput(e.target.value)
                                    e.target.style.height = '0'
                                    e.target.style.height = `${e.target.scrollHeight}px`
                                    e.target.style.overflowY = e.target.scrollHeight > 102 ? 'auto' : 'hidden'
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    noEntry
                                        ? 'Add performers first…'
                                        : !modelConfigured
                                            ? 'Configure a model for the entry performer…'
                                            : `Message ${entryKey ?? 'entry'}…`
                                }
                                rows={1}
                                disabled={noEntry || !modelConfigured || isLoading}
                                className="text-input"
                            />
                            {isLoading ? (
                                <button className="send-btn abort" onClick={() => chatKey && abortChat(chatKey)} title="Abort generation">
                                    <Square size={12} fill="currentColor" />
                                </button>
                            ) : (
                                <button className="send-btn" onClick={handleSend} disabled={!input.trim() || noEntry || !modelConfigured}>
                                    <Send size={12} />
                                </button>
                            )}
                        </div>
                        {entryPerformer && (
                            <div className="chat-input__runtime-row">
                                <span className="act-chat__entry-label">
                                    <Zap size={9} />
                                    {entryKey}
                                </span>
                            </div>
                        )}
                    </div>
                }
            />
        </div>
    )
}
