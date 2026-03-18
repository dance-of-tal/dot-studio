import { useState, useRef, useEffect, useCallback } from 'react'
import { useStudioStore } from '../../store'
import { Send, Sparkles, ChevronUp, AlertCircle, Settings, Plus } from 'lucide-react'
import { useModels } from '../../hooks/queries'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import { DropdownMenu } from '../../components/shared/DropdownMenu'
import { ASSISTANT_PERFORMER_ID } from '../../store/assistantSlice'

// Reuse performer chat rendering components
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'

import './AssistantChat.css'

export function AssistantChat() {
    const {
        isAssistantOpen,
        chats,
        loadingPerformerId,
        sendMessage,
        startNewSession,
        ensureAssistantPerformer,
        initRealtimeEvents,
    } = useStudioStore()

    const messages = chats[ASSISTANT_PERFORMER_ID] || []
    const isLoading = loadingPerformerId === ASSISTANT_PERFORMER_ID

    const { data: models } = useModels()
    const connectedModels = (models ?? []).filter(m => m.connected)
    const hasModels = connectedModels.length > 0

    const [input, setInput] = useState('')
    const [panelWidth, setPanelWidth] = useState(320)
    const [selectedModel, setSelectedModel] = useState<{ provider: string; modelId: string } | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)
    const dragging = useRef(false)

    // Auto-select first connected model
    useEffect(() => {
        if (!selectedModel && connectedModels.length > 0) {
            setSelectedModel({ provider: connectedModels[0].provider, modelId: connectedModels[0].id })
        }
    }, [connectedModels, selectedModel])

    // Ensure hidden performer node exists with selected model
    useEffect(() => {
        if (selectedModel) {
            ensureAssistantPerformer(selectedModel)
        }
    }, [selectedModel, ensureAssistantPerformer])

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
        if (!input.trim() || !selectedModel) return
        // Ensure SSE is connected
        initRealtimeEvents()
        // Ensure performer node is registered with selected model before sending
        // (useEffect might not have fired yet on first send)
        ensureAssistantPerformer(selectedModel)
        // Delegate entirely to chatSlice.sendMessage — same as performer
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

    const currentModelLabel = selectedModel
        ? (connectedModels.find(m => m.provider === selectedModel.provider && m.id === selectedModel.modelId)?.name || selectedModel.modelId)
        : null

    const groupedModels = connectedModels.reduce<Record<string, RuntimeModelCatalogEntry[]>>((acc, m) => {
        if (!acc[m.providerName]) acc[m.providerName] = []
        acc[m.providerName].push(m)
        return acc
    }, {})

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
                                <ChatMessageContent message={msg} />
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
                                                    active={selectedModel?.provider === m.provider && selectedModel?.modelId === m.id}
                                                    onClick={() => setSelectedModel({ provider: m.provider, modelId: m.id })}
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
