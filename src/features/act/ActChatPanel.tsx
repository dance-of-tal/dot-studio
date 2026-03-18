/**
 * ActChatPanel — Thread-based performer chat for Act canvas node.
 *
 * Choreography model: each Thread has independent performer sessions.
 * User interacts with individual performers via tabs.
 * Wake-up prompts are visually distinguished from user input.
 */
import { useState, useCallback, useMemo, useRef } from 'react'
import { Send, Square, Workflow, Users, Plus } from 'lucide-react'
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
        actThreads, activeThreadId, activeThreadPerformerKey,
        createThread, selectThread, selectThreadPerformer,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === actId), [acts, actId])
    const [input, setInput] = useState('')
    const chatEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Thread state
    const threads = actThreads[actId] || []
    const currentThread = threads.find((t) => t.id === activeThreadId) || threads[0] || null

    // Active performer in thread
    const performerKeys = act ? Object.keys(act.performers) : []
    const activePerformerKey = activeThreadPerformerKey || performerKeys[0] || null

    // Namespaced chat key for this thread+performer
    const chatKey = activePerformerKey && currentThread
        ? `act:${actId}:${activePerformerKey}`
        : null

    // Messages
    const messages: ChatMessage[] = useMemo(() => {
        if (!chatKey) return []
        return chats[chatKey] || []
    }, [chats, chatKey])

    const isLoading = chatKey ? loadingPerformerId === chatKey : false

    // Resolve performer model from ref binding
    const resolvedPerformer = (() => {
        if (!act || !activePerformerKey) return null
        const binding = act.performers[activePerformerKey]
        if (!binding) return null
        const ref = binding.performerRef
        if (ref.kind === 'draft') {
            return useStudioStore.getState().performers.find((p) => p.id === ref.draftId) || null
        } else {
            return useStudioStore.getState().performers.find((p) => p.meta?.derivedFrom === ref.urn) || null
        }
    })()
    const modelConfigured = hasModelConfig(resolvedPerformer?.model || null)

    const handleSend = useCallback(() => {
        if (!input.trim() || isLoading || !activePerformerKey || !modelConfigured) return
        const text = input.trim()
        setInput('')
        sendActMessage(actId, activePerformerKey, text)
    }, [input, isLoading, activePerformerKey, modelConfigured, sendActMessage, actId])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }, [handleSend])

    const handleCreateThread = useCallback(async () => {
        try {
            await createThread(actId)
        } catch (err) {
            console.error('Failed to create thread', err)
        }
    }, [actId, createThread])

    if (!act) return null

    const noPerformers = performerKeys.length === 0

    return (
        <div className="act-chat">
            {/* Thread selector mini bar */}
            {threads.length > 0 && (
                <div className="act-chat__thread-bar">
                    {threads.map((thread) => (
                        <button
                            key={thread.id}
                            className={`act-chat__thread-tab ${thread.id === currentThread?.id ? 'act-chat__thread-tab--active' : ''}`}
                            onClick={() => selectThread(thread.id)}
                            title={`Thread ${thread.id.slice(0, 6)} (${thread.status})`}
                        >
                            <Workflow size={9} />
                            <span>{thread.id.slice(0, 6)}</span>
                        </button>
                    ))}
                    <button
                        className="act-chat__thread-tab act-chat__thread-tab--add"
                        onClick={handleCreateThread}
                        title="New Thread"
                    >
                        <Plus size={9} />
                    </button>
                </div>
            )}

            {/* Performer tabs */}
            {performerKeys.length > 1 && (
                <div className="act-chat__filters">
                    {performerKeys.map((key) => (
                        <button
                            key={key}
                            className={`act-chat__filter-tab ${activePerformerKey === key ? 'act-chat__filter-tab--active' : ''}`}
                            onClick={() => selectThreadPerformer(key)}
                        >
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
                            <div className={`act-chat__system ${(msg.metadata as any)?.isWakeUp ? 'act-chat__system--wakeup' : ''}`}>
                                {(msg.metadata as any)?.isWakeUp && <Workflow size={10} />}
                                {msg.content}
                            </div>
                        ) : (
                            <ChatMessageContent message={msg} />
                        )}
                    </div>
                )}
                renderEmpty={() => (
                    <div className="act-chat__empty">
                        {noPerformers ? (
                            <>
                                <Users size={16} />
                                <span>Add performers to start</span>
                            </>
                        ) : !modelConfigured ? (
                            <>
                                <Workflow size={16} />
                                <span>Configure a model for this performer</span>
                            </>
                        ) : threads.length === 0 ? (
                            <>
                                <Workflow size={16} />
                                <span>Create a thread to start collaboration</span>
                                <button className="act-chat__create-btn" onClick={handleCreateThread}>
                                    <Plus size={12} /> New Thread
                                </button>
                            </>
                        ) : (
                            <>
                                <Workflow size={16} />
                                <span>Send a message to {activePerformerKey}</span>
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
                                    noPerformers
                                        ? 'Add performers first…'
                                        : !modelConfigured
                                            ? 'Configure a model for this performer…'
                                            : `Message ${activePerformerKey ?? 'performer'}…`
                                }
                                rows={1}
                                disabled={noPerformers || !modelConfigured || isLoading}
                                className="text-input"
                            />
                            {isLoading ? (
                                <button className="send-btn abort" onClick={() => chatKey && abortChat(chatKey)} title="Abort generation">
                                    <Square size={12} fill="currentColor" />
                                </button>
                            ) : (
                                <button className="send-btn" onClick={handleSend} disabled={!input.trim() || noPerformers || !modelConfigured}>
                                    <Send size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                }
            />
        </div>
    )
}
