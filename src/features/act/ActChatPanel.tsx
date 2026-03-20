/**
 * ActChatPanel — Thread-based participant chat for an Act surface.
 *
 * Choreography model: each Thread has independent participant sessions.
 * User interacts with individual participants via tabs.
 * Wake-up prompts are visually distinguished from user input.
 */
import { useState, useCallback, useMemo, useRef } from 'react'
import { Send, Square, Workflow, Users, User, Circle, Activity, Pencil } from 'lucide-react'
import { useStudioStore } from '../../store'
import { hasModelConfig } from '../../lib/performers'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import type { ChatMessage } from '../../types'
import ActActivityView from './ActActivityView'
import { resolveActParticipantLabel } from './participant-labels'
import './ActChatPanel.css'

interface ActChatPanelProps {
    actId: string
}

function buildActParticipantChatKey(actId: string, threadId: string, participantKey: string) {
    return `act:${actId}:thread:${threadId}:participant:${participantKey}`
}

export default function ActChatPanel({ actId }: ActChatPanelProps) {
    const {
        acts, chats, loadingPerformerId, sendActMessage, abortChat,
        actThreads, activeThreadId, activeThreadParticipantKey,
        selectThreadParticipant, openActEditor,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === actId), [acts, actId])
    const [input, setInput] = useState('')
    const chatEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Thread state
    const threads = actThreads[actId] || []
    const currentThread = threads.find((t) => t.id === activeThreadId) || null

    // Active participant in thread
    const participantKeys = act ? Object.keys(act.participants) : []
    const isCallboardView = !!currentThread && activeThreadParticipantKey === null
    const activeParticipantKey = isCallboardView ? null : activeThreadParticipantKey || participantKeys[0] || null

    // Namespaced chat key for this thread+performer
    const chatKey = activeParticipantKey && currentThread
        ? buildActParticipantChatKey(actId, currentThread.id, activeParticipantKey)
        : null

    // Messages
    const messages: ChatMessage[] = useMemo(() => {
        if (!chatKey) return []
        return chats[chatKey] || []
    }, [chats, chatKey])

    const isLoading = chatKey ? loadingPerformerId === chatKey : false

    // Resolve performer model from ref binding
    const resolvedPerformer = (() => {
        if (!act || !activeParticipantKey) return null
        const binding = act.participants[activeParticipantKey]
        if (!binding) return null
        const ref = binding.performerRef
        if (ref.kind === 'draft') {
            return useStudioStore.getState().performers.find((p) => p.id === ref.draftId) || null
        } else {
            return useStudioStore.getState().performers.find((p) => p.meta?.derivedFrom === ref.urn) || null
        }
    })()
    const modelConfigured = hasModelConfig(resolvedPerformer?.model || null)

    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading || !currentThread || !activeParticipantKey || !modelConfigured) return
        const text = input.trim()
        setInput('')
        await sendActMessage(actId, currentThread.id, activeParticipantKey, text)
    }, [input, isLoading, currentThread, activeParticipantKey, modelConfigured, sendActMessage, actId])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
    }, [handleSend])

    if (!act) return null

    const noParticipants = participantKeys.length === 0
    const sharedPerformers = useStudioStore.getState().performers
    const activeParticipantLabel = activeParticipantKey
        ? resolveActParticipantLabel(act, activeParticipantKey, sharedPerformers)
        : null

    return (
        <div className="act-chat">
            {/* Performer tabs */}
            {currentThread && (
            <div className="act-chat__filters">
                <button
                    className={`act-chat__filter-tab ${isCallboardView ? 'act-chat__filter-tab--active' : ''}`}
                    onClick={() => selectThreadParticipant(null)}
                >
                    <Activity size={10} />
                    <span>Callboard</span>
                </button>
                {participantKeys.length === 1 ? (
                    <button
                        className={`act-chat__filter-tab ${activeParticipantKey === participantKeys[0] ? 'act-chat__filter-tab--active' : ''}`}
                        onClick={() => selectThreadParticipant(participantKeys[0])}
                    >
                        <User size={10} />
                        <span>{resolveActParticipantLabel(act, participantKeys[0], sharedPerformers)}</span>
                        {isLoading && activeParticipantKey === participantKeys[0] && <Circle size={6} className="act-chat__loading-dot" />}
                    </button>
                ) : participantKeys.map((key) => {
                    const isActive = activeParticipantKey === key
                    const participantChatKey = currentThread
                        ? buildActParticipantChatKey(actId, currentThread.id, key)
                        : null
                    const isKeyLoading = participantChatKey ? loadingPerformerId === participantChatKey : false
                    return (
                        <button
                            key={key}
                            className={`act-chat__filter-tab ${isActive ? 'act-chat__filter-tab--active' : ''}`}
                            onClick={() => selectThreadParticipant(key)}
                        >
                            <User size={10} />
                            <span>{resolveActParticipantLabel(act, key, sharedPerformers)}</span>
                            {isKeyLoading && <Circle size={5} className="act-chat__loading-dot" />}
                        </button>
                    )
                })}
            </div>
            )}

            {isCallboardView && currentThread ? (
                <ActActivityView actId={actId} threadId={currentThread.id} mode="callboard" />
            ) : (
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
                        {noParticipants ? (
                            <>
                                <Users size={20} className="act-chat__empty-icon" />
                                <strong>No participants bound</strong>
                                <span>Enter edit mode to connect performers on the canvas.</span>
                                <button
                                    className="act-chat__action-btn"
                                    onClick={() => openActEditor(actId, 'act')}
                                >
                                    <Pencil size={11} /> Edit Act
                                </button>
                            </>
                        ) : !modelConfigured ? (
                            <>
                                <User size={20} className="act-chat__empty-icon" />
                                <strong>Model not configured</strong>
                                <span>Set up a model for &ldquo;{activeParticipantLabel || activeParticipantKey}&rdquo; in the performer editor.</span>
                            </>
                        ) : !currentThread ? (
                            <>
                                <Workflow size={20} className="act-chat__empty-icon" />
                                <strong>No thread selected</strong>
                                <span>Select or create a thread from the left sidebar to start the act runtime.</span>
                            </>
                        ) : (
                            <>
                                <User size={20} className="act-chat__empty-icon" />
                                <strong>Chat with {activeParticipantLabel || activeParticipantKey}</strong>
                                <span>Send a message below to start the conversation.</span>
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
                                    noParticipants
                                        ? 'Add performers first…'
                                        : !currentThread
                                            ? 'Select a thread from the sidebar…'
                                        : !modelConfigured
                                            ? 'Configure a model for this performer…'
                                            : `Message ${activeParticipantLabel ?? activeParticipantKey ?? 'participant'}…`
                                }
                                rows={1}
                                disabled={noParticipants || !currentThread || !modelConfigured || isLoading}
                                className="text-input"
                            />
                            {isLoading ? (
                                <button className="send-btn abort" onClick={() => chatKey && abortChat(chatKey)} title="Abort generation">
                                    <Square size={12} fill="currentColor" />
                                </button>
                            ) : (
                                <button className="send-btn" onClick={() => void handleSend()} disabled={!input.trim() || noParticipants || !currentThread || !modelConfigured}>
                                    <Send size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                }
            />
            )}
        </div>
    )
}
