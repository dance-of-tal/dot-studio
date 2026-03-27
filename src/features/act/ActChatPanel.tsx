/**
 * ActChatPanel — Thread-based participant chat for an Act surface.
 *
 * Choreography model: each Thread has independent participant sessions.
 * User interacts with individual participants via tabs.
 * Wake-up prompts are visually distinguished from user input.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Send, Square, Workflow, Users, User, Circle, Pencil, Plus, AlertCircle, Clipboard } from 'lucide-react'
import { useStudioStore } from '../../store'
import { hasModelConfig } from '../../lib/performers'
import {
    selectMessagesForChatKey,
    selectChatKeyIsLoading,
    selectPendingPermission,
    selectPendingQuestion,
    selectSessionIdForChatKey,
    selectTodos,
} from '../../store/session'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent, {
    hasVisibleAssistantMessageContent,
} from '../chat/ChatMessageContent'
import { hasVisibleUserMessageContent } from '../chat/chat-message-visibility'
import type { ChatMessage } from '../../types'
import { resolveActParticipantLabel } from './participant-labels'
import ActBoardView from './ActBoardView'
import { evaluateActReadiness } from './act-readiness'
import PermissionDock from '../performer/PermissionDock'
import QuestionWizard from '../performer/QuestionWizard'
import { usePermissionInteraction } from '../../hooks/usePermissionInteraction'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { TodoDock } from '../../components/chat/TodoDock'
import './ActChatPanel.css'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TODOS: never[] = []


interface ActChatPanelProps {
    actId: string
}

function buildActParticipantChatKey(actId: string, threadId: string, participantKey: string) {
    return `act:${actId}:thread:${threadId}:participant:${participantKey}`
}



export default function ActChatPanel({ actId }: ActChatPanelProps) {
    const {
        acts, performers, sendActMessage, abortChat,
        actThreads, activeThreadId, activeThreadParticipantKey,
        selectThreadParticipant, openActEditor, createThread, selectThread, loadThreads,
        respondToPermission, respondToQuestion, rejectQuestion,
    } = useStudioStore()

    const act = useMemo(() => acts.find((a) => a.id === actId), [acts, actId])
    const [input, setInput] = useState('')
    const chatEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const [isCreatingThread, setIsCreatingThread] = useState(false)

    // Readiness evaluation
    const readiness = useMemo(
        () => act ? evaluateActReadiness(act, performers) : { runnable: false, issues: [] },
        [act, performers],
    )

    // Thread state
    const threads = actThreads[actId] || []
    const currentThread = threads.find((t) => t.id === activeThreadId) || null

    useEffect(() => {
        void loadThreads(actId)
    }, [actId, loadThreads])

    // Active participant in thread
    const participantKeys = act ? Object.keys(act.participants) : []
    const isCallboardView = !!currentThread && activeThreadParticipantKey === null
    const activeParticipantKey = isCallboardView ? null : activeThreadParticipantKey || participantKeys[0] || null

    // Namespaced chat key for this thread+performer
    const chatKey = activeParticipantKey && currentThread
        ? buildActParticipantChatKey(actId, currentThread.id, activeParticipantKey)
        : null

    // Messages from entity store (falls back to legacy chats[chatKey])
    const messages: ChatMessage[] = useStudioStore((state) => {
        if (!chatKey) return EMPTY_MESSAGES
        return selectMessagesForChatKey(state, chatKey)
    })

    const isLoading = useStudioStore((state) => {
        if (!chatKey) return false
        return selectChatKeyIsLoading(state, chatKey)
    })
    const sessionId = useStudioStore((state) => chatKey ? selectSessionIdForChatKey(state, chatKey) : null)
    const actTodos = useStudioStore((state) => {
        if (!sessionId) return EMPTY_TODOS
        return selectTodos(state, sessionId)
    })
    const permissionRequest = useStudioStore((state) => (
        sessionId ? selectPendingPermission(state, sessionId) : null
    ))
    const questionRequest = useStudioStore((state) => (
        sessionId ? selectPendingQuestion(state, sessionId) : null
    ))
    const hasPendingPermission = !!permissionRequest
    const isTodoLive = isLoading || hasPendingPermission

    const {
        isResponding: isRespondingToPermission,
        permissionRequest: activePermissionRequest,
        questionRequest: activeQuestionRequest,
        handlePermissionDecide,
        handleQuestionRespond,
        handleQuestionReject,
    } = usePermissionInteraction({
        sessionId,
        permissionRequest,
        questionRequest,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
    })

    const handleTodoClear = useCallback(() => {
        if (!sessionId) return
        useStudioStore.setState((state) => {
            const next = { ...state.todos }
            const nextEntity = { ...state.seTodos }
            delete next[sessionId]
            if (chatKey) delete next[chatKey]
            delete nextEntity[sessionId]
            return {
                todos: next,
                seTodos: nextEntity,
            }
        })
    }, [sessionId, chatKey])

    const activeParticipantLabel = useMemo(
        () => activeParticipantKey
            ? resolveActParticipantLabel(act, activeParticipantKey, performers)
            : null,
        [act, activeParticipantKey, performers],
    )

    // Polling removed — entity store is event-driven via dual-write in integrationSlice.
    // SSE events flow through event-ingest → event-reducer → seMessages,
    // and selectMessagesForChatKey reads from seMessages with legacy fallback.

    // Auto-scroll is now handled by ThreadBody's useAutoScroll hook

    // Resolve performer model from ref binding
    const resolvedPerformer = useMemo(() => {
        if (!act || !activeParticipantKey) return null
        const binding = act.participants[activeParticipantKey]
        if (!binding) return null
        const ref = binding.performerRef
        if (ref.kind === 'draft') {
            return performers.find((p) =>
                p.id === ref.draftId
                || p.meta?.derivedFrom === `draft:${ref.draftId}`,
            ) || null
        } else {
            return performers.find((p) => p.meta?.derivedFrom === ref.urn) || null
        }
    }, [act, activeParticipantKey, performers])
    const modelConfigured = hasModelConfig(resolvedPerformer?.model || null)

    const handleCreateThread = useCallback(async () => {
        if (!readiness.runnable || isCreatingThread) return
        setIsCreatingThread(true)
        try {
            const threadId = await createThread(actId)
            selectThread(actId, threadId)
        } finally {
            setIsCreatingThread(false)
        }
    }, [readiness.runnable, isCreatingThread, createThread, actId, selectThread])

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

    return (
        <div className="act-chat">
            {/* Performer tabs */}
            {currentThread && (
            <div className="act-chat__filters">
                <button
                    className={`act-chat__filter-tab ${isCallboardView ? 'act-chat__filter-tab--active' : ''}`}
                    onClick={() => selectThreadParticipant(null)}
                >
                    <Clipboard size={10} />
                    <span>Board</span>
                </button>
                {participantKeys.length === 1 ? (
                    <button
                        className={`act-chat__filter-tab ${activeParticipantKey === participantKeys[0] ? 'act-chat__filter-tab--active' : ''}`}
                        onClick={() => selectThreadParticipant(participantKeys[0])}
                    >
                        <User size={10} />
                        <span>{resolveActParticipantLabel(act, participantKeys[0], performers)}</span>
                        {isLoading && activeParticipantKey === participantKeys[0] && <Circle size={6} className="act-chat__loading-dot" />}
                    </button>
                ) : participantKeys.map((key) => {
                    const isActive = activeParticipantKey === key
                    const participantChatKey = currentThread
                        ? buildActParticipantChatKey(actId, currentThread.id, key)
                        : null
                    const isKeyLoading = participantChatKey
                        ? useStudioStore.getState().chatKeyToSession[participantChatKey]
                            ? selectChatKeyIsLoading(useStudioStore.getState(), participantChatKey)
                            : false
                        : false
                    return (
                        <button
                            key={key}
                            className={`act-chat__filter-tab ${isActive ? 'act-chat__filter-tab--active' : ''}`}
                            onClick={() => selectThreadParticipant(key)}
                        >
                            <User size={10} />
                            <span>{resolveActParticipantLabel(act, key, performers)}</span>
                            {isKeyLoading && <Circle size={5} className="act-chat__loading-dot" />}
                        </button>
                    )
                })}
            </div>
            )}

            {isCallboardView && currentThread ? (
                <ActBoardView actId={actId} threadId={currentThread.id} />
            ) : (
            <ThreadBody
                messages={messages}
                loading={isLoading}
                renderMessage={(msg, index) => {
                    if (msg.role === 'user' && !hasVisibleUserMessageContent(msg)) {
                        return null
                    }
                    if (msg.role === 'assistant' && !hasVisibleAssistantMessageContent(msg)) {
                        return null
                    }
                    return (
                    <div key={msg.id || index} className={`thread-msg thread-msg--${msg.role}`} data-scrollable>
                        {msg.role === 'user' ? (
                            <div className="user-input-box">
                                <span className="user-input-text">{msg.content}</span>
                            </div>
                        ) : msg.role === 'system' ? (
                            <div className={`act-chat__system ${msg.metadata?.isWakeUp ? 'act-chat__system--wakeup' : ''}`}>
                                {msg.metadata?.isWakeUp && <Workflow size={10} />}
                                {msg.content}
                            </div>
                        ) : (
                            <ChatMessageContent message={msg} />
                        )}
                    </div>
                    )
                }}
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
                        ) : !readiness.runnable ? (
                            <>
                                <AlertCircle size={20} className="act-chat__empty-icon" />
                                <strong>Act is not ready to run</strong>
                                <div className="act-chat__issues">
                                    {readiness.issues
                                        .filter((i) => i.severity === 'error')
                                        .map((issue, idx) => (
                                            <span key={idx} className="act-chat__issue-item">
                                                {issue.message}
                                            </span>
                                        ))}
                                </div>
                                <button
                                    className="act-chat__action-btn"
                                    onClick={() => openActEditor(actId, 'act')}
                                >
                                    <Pencil size={11} /> Edit Act
                                </button>
                            </>
                        ) : !currentThread ? (
                            <>
                                <Workflow size={20} className="act-chat__empty-icon" />
                                <strong>Ready to run</strong>
                                <span>Create a thread to start the act runtime.</span>
                                <button
                                    className="act-chat__action-btn"
                                    onClick={() => void handleCreateThread()}
                                    disabled={isCreatingThread}
                                >
                                    <Plus size={11} /> {isCreatingThread ? 'Creating…' : 'Create Thread'}
                                </button>
                            </>
                        ) : !modelConfigured ? (
                            <>
                                <User size={20} className="act-chat__empty-icon" />
                                <strong>Model not configured</strong>
                                <span>Set up a model for &ldquo;{activeParticipantLabel || activeParticipantKey}&rdquo; in the performer editor.</span>
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
                    <div className="thread-msg thread-msg--assistant" data-scrollable>
                        <div className="assistant-body">
                            <TextShimmer text="Thinking" active />
                        </div>
                    </div>
                )}
                endRef={chatEndRef}
                composer={
                    <>
                    <TodoDock todos={actTodos} isLive={isTodoLive} onClear={handleTodoClear} />
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
                                        : !readiness.runnable
                                            ? 'Resolve readiness issues first…'
                                        : !currentThread
                                            ? 'Create a thread to start…'
                                        : !modelConfigured
                                            ? 'Configure a model for this performer…'
                                            : `Message ${activeParticipantLabel ?? activeParticipantKey ?? 'participant'}…`
                                }
                                rows={1}
                                disabled={noParticipants || !readiness.runnable || !currentThread || !modelConfigured || isLoading}
                                className="text-input"
                            />
                            {isLoading ? (
                                <button className="send-btn abort" onClick={() => chatKey && abortChat(chatKey)} title="Abort generation">
                                    <Square size={12} fill="currentColor" />
                                </button>
                            ) : (
                                <button className="send-btn" onClick={() => void handleSend()} disabled={!input.trim() || noParticipants || !readiness.runnable || !currentThread || !modelConfigured}>
                                    <Send size={12} />
                                </button>
                            )}
                        </div>

                        {activePermissionRequest ? (
                            <PermissionDock
                                request={activePermissionRequest}
                                responding={isRespondingToPermission}
                                onDecide={handlePermissionDecide}
                            />
                        ) : null}

                        {activeQuestionRequest ? (
                            <QuestionWizard
                                key={activeQuestionRequest.id}
                                request={activeQuestionRequest}
                                responding={isRespondingToPermission}
                                onRespond={handleQuestionRespond}
                                onReject={handleQuestionReject}
                            />
                        ) : null}
                    </div>
                    </>
                }
            />
            )}
        </div>
    )
}
