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
import { useChatSession } from '../../store/session/use-chat-session'
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import {
    hasVisibleAssistantMessageContent,
    hasVisibleUserMessageContent,
    isStreamingAssistantMessage,
    shouldShowAssistantLoadingPlaceholder,
} from '../chat/chat-message-visibility'
import type { ChatMessage } from '../../types'
import { resolveActParticipantLabel } from './participant-labels'
import ActBoardView from './ActBoardView'
import { evaluateActReadiness } from './act-readiness'
import PermissionDock from '../performer/PermissionDock'
import QuestionWizard from '../performer/QuestionWizard'
import { usePermissionInteraction } from '../../hooks/usePermissionInteraction'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { TodoDock } from '../../components/chat/TodoDock'
import { resolveDisplayedActThread } from '../../lib/act-threads'
import {
    buildActiveActParticipantChatKey,
    buildActParticipantLoadingStates,
    resolveActiveActParticipantKey,
    resolveActParticipantPerformer,
} from './act-chat-panel-helpers'
import './ActChatPanel.css'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_THREADS: never[] = []

interface ActChatPanelProps {
    actId: string
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
    const threads = useMemo(() => actThreads[actId] || EMPTY_THREADS, [actId, actThreads])
    const currentThread = useMemo(
        () => resolveDisplayedActThread(threads, activeThreadId),
        [activeThreadId, threads],
    )

    useEffect(() => {
        void loadThreads(actId)
    }, [actId, loadThreads])

    const participantKeys = act ? Object.keys(act.participants) : []
    const { isCallboardView, activeParticipantKey } = useMemo(
        () => resolveActiveActParticipantKey(participantKeys, currentThread?.id || null, activeThreadParticipantKey),
        [participantKeys, currentThread, activeThreadParticipantKey],
    )
    const chatKey = useMemo(
        () => buildActiveActParticipantChatKey(actId, currentThread?.id || null, activeParticipantKey),
        [actId, currentThread, activeParticipantKey],
    )

    const chatSession = useChatSession(chatKey)
    const messages: ChatMessage[] = chatSession.messages || EMPTY_MESSAGES
    const isLoading = chatSession.isLoading
    const canAbort = chatSession.canAbort
    const sessionId = chatSession.sessionId
    const actTodos = chatSession.todos
    const permissionRequest = chatSession.permission
    const questionRequest = chatSession.question
    const setSessionTodos = useStudioStore((state) => state.setSessionTodos)
    const chatKeyToSession = useStudioStore((state) => state.chatKeyToSession)
    const sessionLoading = useStudioStore((state) => state.sessionLoading)
    const seMessages = useStudioStore((state) => state.seMessages)
    const seStatuses = useStudioStore((state) => state.seStatuses)
    const sePermissions = useStudioStore((state) => state.sePermissions)
    const seQuestions = useStudioStore((state) => state.seQuestions)
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
        setSessionTodos(sessionId, [])
    }, [sessionId, setSessionTodos])

    const activeParticipantLabel = useMemo(
        () => activeParticipantKey
            ? resolveActParticipantLabel(act, activeParticipantKey, performers)
            : null,
        [act, activeParticipantKey, performers],
    )
    const participantLoadingStates = useMemo(() => {
        return buildActParticipantLoadingStates({
            actId,
            threadId: currentThread?.id || null,
            participantKeys,
            chatKeyToSession,
            sessionLoading,
            seMessages,
            seStatuses,
            sePermissions,
            seQuestions,
        })
    }, [actId, chatKeyToSession, currentThread, participantKeys, sessionLoading, seMessages, seStatuses, sePermissions, seQuestions])

    // Auto-scroll is now handled by ThreadBody's useAutoScroll hook

    // Resolve performer model from ref binding
    const resolvedPerformer = useMemo(
        () => resolveActParticipantPerformer(act, activeParticipantKey, performers),
        [act, activeParticipantKey, performers],
    )
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
                    const isKeyLoading = participantLoadingStates.get(key) || false
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
                loading={shouldShowAssistantLoadingPlaceholder(messages, isLoading)}
                renderMessage={(msg, index) => {
                    const isStreamingAssistant = isStreamingAssistantMessage(messages, index, isLoading)
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
                            <ChatMessageContent message={msg} streaming={isStreamingAssistant} />
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
                                <span>Set up a model for "{activeParticipantLabel || activeParticipantKey}" in the performer editor.</span>
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
                            {canAbort ? (
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
