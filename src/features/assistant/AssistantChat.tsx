import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useStudioStore } from '../../store'
import { Send, Sparkles, ChevronUp, AlertCircle, Settings, Plus } from 'lucide-react'
import { useModels } from '../../hooks/queries'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import { DropdownMenu } from '../../components/shared/DropdownMenu'
import { ASSISTANT_PERFORMER_ID } from '../../store/assistantSlice'
import { applyAssistantActions } from './assistant-actions'
import { getAssistantMessageActions } from './assistant-protocol'
import { showToast } from '../../lib/toast'

// Reuse performer chat rendering components
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'

import './AssistantChat.css'

export function AssistantChat() {
    const {
        isAssistantOpen,
        assistantModel,
        appliedAssistantActionMessageIds,
        assistantActionResults,
        chats,
        loadingPerformerId,
        sendMessage,
        startNewSession,
        setAssistantModel,
        setAssistantAvailableModels,
        markAssistantActionsApplied,
        recordAssistantActionResult,
        initRealtimeEvents,
    } = useStudioStore()

    const assistantMessages = chats[ASSISTANT_PERFORMER_ID]
    const messages = useMemo(() => assistantMessages || [], [assistantMessages])
    const isLoading = loadingPerformerId === ASSISTANT_PERFORMER_ID

    const { data: models } = useModels()
    const connectedModels = useMemo(
        () => (models ?? []).filter((model) => model.connected),
        [models],
    )
    const hasModels = connectedModels.length > 0

    const [input, setInput] = useState('')
    const [panelWidth, setPanelWidth] = useState(320)
    const chatEndRef = useRef<HTMLDivElement>(null)
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
    }, [messages, isLoading, appliedAssistantActionMessageIds, markAssistantActionsApplied, recordAssistantActionResult])

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
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = () => {
        if (!input.trim() || !assistantModel) return
        initRealtimeEvents()
        sendMessage(ASSISTANT_PERFORMER_ID, input)
        setInput('')
    }

    const handleNewSession = () => {
        startNewSession(ASSISTANT_PERFORMER_ID)
    }

    const openSettings = () => {
        document.querySelector<HTMLButtonElement>('[title="Settings"]')?.click()
    }

    if (!isAssistantOpen) return null

    const currentModelLabel = assistantModel
        ? (connectedModels.find(m => m.provider === assistantModel.provider && m.id === assistantModel.modelId)?.name || assistantModel.modelId)
        : null

    const groupedModels = connectedModels.reduce<Record<string, RuntimeModelCatalogEntry[]>>((acc, m) => {
        if (!acc[m.providerName]) acc[m.providerName] = []
        acc[m.providerName].push(m)
        return acc
    }, {})

    const renderAssistantActionStatus = (messageId: string) => {
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
    }

    return (
        <div className="assistant-panel" style={{ width: panelWidth }}>
            <div className="assistant-resize-handle" onMouseDown={onResizeMouseDown} />

            {/* Header */}
            <div className="assistant-header">
                <div className="assistant-header__title">
                    <div className="assistant-header__icon">
                        <Sparkles size={14} />
                    </div>
                    <span>Studio Assistant</span>
                </div>
                <div className="assistant-header__actions">
                    <button
                        className="assistant-sessions__new"
                        onClick={handleNewSession}
                        title="New session"
                    >
                        <Plus size={13} />
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
                    loading={isLoading}
                    historyClassName="assistant-content"
                    endRef={chatEndRef}
                    renderEmpty={() => (
                        <div className="assistant-empty">
                            <Sparkles size={48} className="assistant-empty__icon" />
                            <h3 className="assistant-empty__title">How can I help you design?</h3>
                            <p className="assistant-empty__desc">
                                Ask me to add performers, acts, or explain how DOT Studio works.
                            </p>
                        </div>
                    )}
                    renderMessage={(msg) => (
                        <div key={msg.id} className={`thread-msg thread-msg--${msg.role}`}>
                            {msg.role === 'user' ? (
                                <div className="user-input-box">
                                    <span className="user-input-text">{msg.content}</span>
                                </div>
                            ) : (
                                <>
                                    <ChatMessageContent message={msg} />
                                    {renderAssistantActionStatus(msg.id)}
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
                    composer={
                        <div className="assistant-footer">
                            <div className="assistant-input-wrapper">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.nativeEvent.isComposing) return
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSend()
                                        }
                                    }}
                                    placeholder="Ask the assistant..."
                                    className="assistant-input"
                                    rows={1}
                                />
                                <button
                                    className="assistant-submit"
                                    onClick={handleSend}
                                    disabled={!input.trim()}
                                    title="Send message"
                                >
                                    <Send size={14} />
                                </button>
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
                                            {providerModels.map(m => (
                                                <DropdownMenu.Item
                                                    key={`${m.provider}:${m.id}`}
                                                    active={assistantModel?.provider === m.provider && assistantModel?.modelId === m.id}
                                                    onClick={() => setAssistantModel({ provider: m.provider, modelId: m.id })}
                                                >
                                                    {m.name}
                                                </DropdownMenu.Item>
                                            ))}
                                        </DropdownMenu.Group>
                                    ))}
                                </DropdownMenu>
                            </div>
                        </div>
                    }
                />
            )}
        </div>
    )
}
