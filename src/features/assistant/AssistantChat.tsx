import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import { Send, Sparkles, ChevronUp, AlertCircle, Settings, RefreshCcw, Square, X } from 'lucide-react'
import { useModels } from '../../hooks/queries'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import { DropdownMenu } from '../../components/shared/DropdownMenu'
import { buildAssistantChatKey } from '../../store/assistantSlice'
import { applyAssistantActions } from './assistant-actions'
import { getAssistantMessageActions } from './assistant-protocol'
import { showToast } from '../../lib/toast'
import { useChatSession } from '../../store/session/use-chat-session'
import { TextShimmer } from '../../components/chat/TextShimmer'

// Reuse performer chat rendering components
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import {
    hasVisibleAssistantMessageContent,
    hasVisibleUserMessageContent,
    isStreamingAssistantMessage,
    shouldShowAssistantLoadingPlaceholder,
} from '../chat/chat-message-visibility'

import './AssistantChat.css'

export function AssistantChat() {
    const {
        isAssistantOpen,
        assistantModel,
        appliedAssistantActionMessageIds,
        assistantActionResults,
        sendMessage,
        abortChat,
        startNewSession,
        toggleAssistant,
        setAssistantModel,
        setAssistantAvailableModels,
        markAssistantActionsApplied,
        recordAssistantActionResult,
        initRealtimeEvents,
    } = useStudioStore(useShallow((state) => ({
        isAssistantOpen: state.isAssistantOpen,
        assistantModel: state.assistantModel,
        appliedAssistantActionMessageIds: state.appliedAssistantActionMessageIds,
        assistantActionResults: state.assistantActionResults,
        sendMessage: state.sendMessage,
        abortChat: state.abortChat,
        startNewSession: state.startNewSession,
        toggleAssistant: state.toggleAssistant,
        setAssistantModel: state.setAssistantModel,
        setAssistantAvailableModels: state.setAssistantAvailableModels,
        markAssistantActionsApplied: state.markAssistantActionsApplied,
        recordAssistantActionResult: state.recordAssistantActionResult,
        initRealtimeEvents: state.initRealtimeEvents,
    })))

    const workingDir = useStudioStore((state) => state.workingDir)
    const assistantChatKey = useMemo(() => buildAssistantChatKey(workingDir), [workingDir])
    const chatSession = useChatSession(assistantChatKey)
    const { messages, isLoading, canAbort, activityKind, sessionId, status: sessionStatus } = chatSession

    const { data: models } = useModels()
    const connectedModels = useMemo(
        () => (models ?? []).filter((model) => model.connected),
        [models],
    )
    const hasModels = connectedModels.length > 0

    const [input, setInput] = useState('')
    const [panelWidth, setPanelWidth] = useState(320)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const dragging = useRef(false)

    // Auto-select first connected model
    useEffect(() => {
        if (!assistantModel && connectedModels.length > 0) {
            setAssistantModel({ provider: connectedModels[0].provider, modelId: connectedModels[0].id })
        }
    }, [assistantModel, connectedModels, setAssistantModel])

    const availableAssistantModels = useMemo(
        () => connectedModels.map((model) => ({
            provider: model.provider,
            providerName: model.providerName,
            modelId: model.id,
            name: model.name || model.id,
        })),
        [connectedModels],
    )

    useEffect(() => {
        setAssistantAvailableModels(availableAssistantModels)
    }, [availableAssistantModels, setAssistantAvailableModels])

    useEffect(() => {
        if (isLoading) {
            return
        }
        let cancelled = false

        void (async () => {
            for (const message of messages) {
                if (cancelled || message.role !== 'assistant' || appliedAssistantActionMessageIds[message.id]) {
                    continue
                }
                const actions = getAssistantMessageActions(message)
                if (actions.length === 0) {
                    continue
                }

                // Mark first to avoid duplicate application during rerenders caused by mutations.
                markAssistantActionsApplied(message.id)
                const summary = await applyAssistantActions(actions)
                if (cancelled) return

                recordAssistantActionResult(message.id, summary)
                if (summary.failed > 0) {
                    showToast(
                        summary.applied > 0
                            ? `Studio Assistant applied ${summary.applied} change(s), but ${summary.failed} action(s) could not be applied.`
                            : 'Studio Assistant suggested changes, but they could not be applied to the current stage.',
                        summary.applied > 0 ? 'warning' : 'error',
                        {
                            title: 'Assistant action issue',
                            dedupeKey: `assistant-actions:${message.id}`,
                        },
                    )
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [messages, isLoading, appliedAssistantActionMessageIds, markAssistantActionsApplied, recordAssistantActionResult, workingDir])

    // Resize handle
    const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        dragging.current = true
        const startX = e.clientX
        const startW = panelWidth
        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return
            setPanelWidth(Math.min(520, Math.max(260, startW + (startX - ev.clientX))))
        }
        const onUp = () => {
            dragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [panelWidth])

    useEffect(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = '0px'
        textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }, [input])

    const handleSend = useCallback(() => {
        const trimmed = input.trim()
        if (!trimmed || !assistantModel || isLoading) return
        initRealtimeEvents()
        sendMessage(assistantChatKey, trimmed)
        setInput('')
    }, [assistantChatKey, assistantModel, initRealtimeEvents, input, isLoading, sendMessage])

    const handleRefreshSession = useCallback(async () => {
        if (!hasModels || isLoading) return
        await startNewSession(assistantChatKey)
        setInput('')

        showToast(
            'Assistant session refreshed.',
            'success',
            {
                title: 'Studio Assistant',
                dedupeKey: 'assistant:refresh-session',
            },
        )
    }, [assistantChatKey, hasModels, isLoading, startNewSession])

    const openSettings = useCallback(() => {
        document.querySelector<HTMLButtonElement>('[title="Settings"]')?.click()
    }, [])

    const currentModelLabel = useMemo(() => (
        assistantModel
            ? (connectedModels.find((model) => (
                model.provider === assistantModel.provider
                && model.id === assistantModel.modelId
            ))?.name || assistantModel.modelId)
            : null
    ), [assistantModel, connectedModels])

    const groupedModels = useMemo(() => (
        connectedModels.reduce<Record<string, RuntimeModelCatalogEntry[]>>((acc, model) => {
            if (!acc[model.providerName]) acc[model.providerName] = []
            acc[model.providerName].push(model)
            return acc
        }, {})
    ), [connectedModels])

    const statusLabel = useMemo(() => {
        if (isLoading) return 'Thinking'
        if (activityKind === 'interactive') return 'Needs input'
        if (activityKind === 'parked') return 'Waiting'
        if (!sessionId) return 'Ready'
        switch (sessionStatus?.type) {
            case 'error':
                return 'Needs attention'
            default:
                return 'Ready'
        }
    }, [activityKind, isLoading, sessionId, sessionStatus?.type])

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }, [handleSend])

    const renderAssistantActionStatus = useCallback((messageId: string) => {
        const result = assistantActionResults[messageId]
        if (!result) return null

        let toneClass = 'assistant-action-status--success'
        let label = `Applied ${result.applied} change${result.applied === 1 ? '' : 's'}`

        if (result.failed > 0 && result.applied > 0) {
            toneClass = 'assistant-action-status--warning'
            label = `Applied ${result.applied}, failed ${result.failed}`
        } else if (result.failed > 0) {
            toneClass = 'assistant-action-status--error'
            label = `No changes applied (${result.failed} failed)`
        }

        return (
            <div className={`assistant-action-status ${toneClass}`}>
                {label}
            </div>
        )
    }, [assistantActionResults])

    const renderEmpty = useCallback(() => (
        <div className="assistant-empty">
            <Sparkles size={48} className="assistant-empty__icon" />
            <h3 className="assistant-empty__title">How can I help you design?</h3>
            <p className="assistant-empty__desc">
                Ask me to add performers, acts, or explain how DOT Studio works.
            </p>
        </div>
    ), [])

    const renderMessage = useCallback((msg: typeof messages[number], index: number) => {
        const isStreamingAssistant = isStreamingAssistantMessage(messages, index, isLoading)
        if (msg.role === 'user' && !hasVisibleUserMessageContent(msg)) {
            return null
        }
        if (msg.role === 'assistant' && !hasVisibleAssistantMessageContent(msg)) {
            return null
        }
        return (
            <div key={msg.id} className={`thread-msg thread-msg--${msg.role}`} data-scrollable>
                {msg.role === 'user' ? (
                    <div className="user-input-box">
                        <span className="user-input-text">{msg.content}</span>
                    </div>
                ) : (
                    <>
                        <ChatMessageContent message={msg} streaming={isStreamingAssistant} />
                        {renderAssistantActionStatus(msg.id)}
                    </>
                )}
            </div>
        )
    }, [isLoading, messages, renderAssistantActionStatus])

    const renderLoading = useCallback(() => (
        <div className="thread-msg thread-msg--assistant" data-scrollable>
            <div className="assistant-body">
                <TextShimmer text="Thinking" active />
            </div>
        </div>
    ), [])

    const composer = useMemo(() => (
        <div className="assistant-footer">
            <div className="assistant-input-wrapper">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={isLoading ? 'Assistant is working...' : 'Ask the assistant...'}
                    className="assistant-input"
                    rows={1}
                    disabled={isLoading || !assistantModel}
                />
                {canAbort ? (
                    <button
                        className="assistant-submit"
                        onClick={() => void abortChat(assistantChatKey)}
                        title="Abort generation"
                    >
                        <Square size={14} fill="currentColor" />
                    </button>
                ) : (
                    <button
                        className="assistant-submit"
                        onClick={handleSend}
                        disabled={!input.trim() || !assistantModel}
                        title="Send message"
                    >
                        <Send size={14} />
                    </button>
                )}
            </div>

            <div className="assistant-footer__model-row">
                <DropdownMenu
                    trigger={
                        <button className="assistant-model-pill" title="Change model">
                            <span className="assistant-model-pill__label">{currentModelLabel || 'Select model'}</span>
                            <ChevronUp size={10} />
                        </button>
                    }
                >
                    {Object.entries(groupedModels).map(([providerName, providerModels]) => (
                        <DropdownMenu.Group key={providerName} label={providerName}>
                            {providerModels.map((model) => (
                                <DropdownMenu.Item
                                    key={`${model.provider}:${model.id}`}
                                    active={assistantModel?.provider === model.provider && assistantModel?.modelId === model.id}
                                    onClick={() => setAssistantModel({ provider: model.provider, modelId: model.id })}
                                >
                                    {model.name}
                                </DropdownMenu.Item>
                            ))}
                        </DropdownMenu.Group>
                    ))}
                </DropdownMenu>
            </div>
        </div>
    ), [
        abortChat,
        assistantChatKey,
        assistantModel,
        canAbort,
        currentModelLabel,
        groupedModels,
        handleInputKeyDown,
        handleSend,
        input,
        isLoading,
        setAssistantModel,
    ])

    if (!isAssistantOpen) return null

    return (
        <div className="assistant-panel" style={{ width: panelWidth }}>
            <div className="assistant-resize-handle" onMouseDown={onResizeMouseDown} />

            {/* Header */}
            <div className="assistant-header">
                <div className="assistant-header__meta">
                    <div className="assistant-header__title">
                        <div className="assistant-header__icon">
                            <Sparkles size={14} />
                        </div>
                        <span>Studio Assistant</span>
                    </div>
                    <div className="assistant-header__subtitle">
                        <span>{currentModelLabel || 'No model selected'}</span>
                        <span className={`assistant-status-pill ${isLoading ? 'is-busy' : ''}`}>{statusLabel}</span>
                    </div>
                </div>
                <div className="assistant-header__actions">
                    <button
                        className="assistant-sessions__new"
                        onClick={handleRefreshSession}
                        title="Refresh session"
                        disabled={!hasModels || isLoading}
                    >
                        <RefreshCcw size={13} />
                    </button>
                    <button
                        className="icon-btn assistant-header__close"
                        onClick={toggleAssistant}
                        title="Hide Studio Assistant"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            {/* Messages + Composer — reuses ThreadBody from performer */}
            {!hasModels ? (
                <div className="assistant-content">
                    <div className="assistant-empty">
                        <AlertCircle size={40} className="assistant-empty__icon assistant-empty__icon--warn" />
                        <h3 className="assistant-empty__title">Model not configured</h3>
                        <p className="assistant-empty__desc">
                            To use the Studio Assistant, configure at least one AI model provider first.
                        </p>
                        <button className="assistant-setup-btn" onClick={openSettings}>
                            <Settings size={14} />
                            <span>Open Settings</span>
                        </button>
                    </div>
                </div>
            ) : (
                <ThreadBody
                    messages={messages}
                    loading={shouldShowAssistantLoadingPlaceholder(messages, isLoading)}
                    scrollStateKey={assistantChatKey}
                    historyClassName="assistant-content"
                    renderEmpty={renderEmpty}
                    renderMessage={renderMessage}
                    renderLoading={renderLoading}
                    composer={composer}
                />
            )}
        </div>
    )
}
