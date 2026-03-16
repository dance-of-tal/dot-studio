import { useState, useRef, useEffect, useCallback } from 'react'
import { useStudioStore } from '../../store'
import { Send, Sparkles, X, Trash2, Settings, ChevronDown, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useModels } from '../../hooks/queries'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import './AssistantChat.css'

export function AssistantChat() {
    const { 
        assistantMessages, 
        sendAssistantMessage, 
        isAssistantOpen, 
        toggleAssistant,
        clearAssistantHistory 
    } = useStudioStore()
    
    const { data: models } = useModels()
    const connectedModels = (models ?? []).filter(m => m.connected)
    const hasModels = connectedModels.length > 0

    const [input, setInput] = useState('')
    const [panelWidth, setPanelWidth] = useState(320)
    const [selectedModel, setSelectedModel] = useState<{ provider: string; modelId: string } | null>(null)
    const [modelMenuOpen, setModelMenuOpen] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const dragging = useRef(false)

    // Auto-select first connected model if none selected
    useEffect(() => {
        if (!selectedModel && connectedModels.length > 0) {
            setSelectedModel({ provider: connectedModels[0].provider, modelId: connectedModels[0].id })
        }
    }, [connectedModels, selectedModel])

    // ── Resize handle (mirrors LeftSidebar, inverted direction) ──
    const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        dragging.current = true
        const startX = e.clientX
        const startW = panelWidth

        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return
            const delta = startX - ev.clientX
            setPanelWidth(Math.min(520, Math.max(260, startW + delta)))
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

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [assistantMessages])

    const handleSend = () => {
        if (!input.trim() || !selectedModel) return
        sendAssistantMessage(input, `${selectedModel.provider}/${selectedModel.modelId}`)
        setInput('')
    }

    // Open settings modal
    const openSettings = () => {
        // Trigger the settings modal by dispatching a custom event
        // (SettingsModal listens for this in StageToolbar)
        document.querySelector<HTMLButtonElement>('[title="Settings"]')?.click()
    }

    if (!isAssistantOpen) return null

    const currentModelLabel = selectedModel
        ? (connectedModels.find(m => m.provider === selectedModel.provider && m.id === selectedModel.modelId)?.name || selectedModel.modelId)
        : null

    // Group connected models by provider for the dropdown
    const groupedModels = connectedModels.reduce<Record<string, RuntimeModelCatalogEntry[]>>((acc, m) => {
        if (!acc[m.providerName]) acc[m.providerName] = []
        acc[m.providerName].push(m)
        return acc
    }, {})

    return (
        <div className="assistant-panel" style={{ width: panelWidth }}>
            {/* Resize handle */}
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
                    <button className="icon-btn" onClick={clearAssistantHistory} title="Clear conversation">
                        <Trash2 size={12} />
                    </button>
                    <button className="icon-btn" onClick={toggleAssistant} title="Close Assistant">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Model Selector — only show when models exist */}
            {hasModels && (
                <div className="assistant-model-bar">
                    <button
                        className="assistant-model-btn"
                        onClick={() => setModelMenuOpen(o => !o)}
                        title="Change model"
                    >
                        <ChevronDown size={10} />
                        <span className="assistant-model-btn__label">{currentModelLabel || 'Select model'}</span>
                    </button>
                    {modelMenuOpen && (
                        <div className="assistant-model-menu">
                            {Object.entries(groupedModels).map(([providerName, providerModels]) => (
                                <div key={providerName}>
                                    <div className="assistant-model-menu__provider">{providerName}</div>
                                    {providerModels.map(m => (
                                        <button
                                            key={`${m.provider}:${m.id}`}
                                            className={`assistant-model-menu__item ${selectedModel?.provider === m.provider && selectedModel?.modelId === m.id ? 'is-active' : ''}`}
                                            onClick={() => {
                                                setSelectedModel({ provider: m.provider, modelId: m.id })
                                                setModelMenuOpen(false)
                                            }}
                                        >
                                            {m.name}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            <div className="assistant-content">
                {!hasModels ? (
                    /* No model configured — guide user to Settings */
                    <div className="assistant-empty">
                        <AlertCircle size={40} className="assistant-empty__icon assistant-empty__icon--warn" />
                        <h3 className="assistant-empty__title">Model not configured</h3>
                        <p className="assistant-empty__desc">
                            To use the Studio Assistant, you need to configure at least one AI model provider first.
                        </p>
                        <button className="assistant-setup-btn" onClick={openSettings}>
                            <Settings size={14} />
                            <span>Open Settings</span>
                        </button>
                    </div>
                ) : assistantMessages.length === 0 ? (
                    <div className="assistant-empty">
                        <Sparkles size={48} className="assistant-empty__icon" />
                        <h3 className="assistant-empty__title">How can I help you design?</h3>
                        <p className="assistant-empty__desc">
                            Ask me to add performers, acts, or explain how DOT Studio works.
                        </p>
                    </div>
                ) : (
                    assistantMessages.map((msg) => (
                        <div key={msg.id} className={`assistant-msg ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                            {msg.role === 'assistant' && (
                                <div className="assistant-msg__avatar">
                                    <Sparkles size={14} />
                                </div>
                            )}
                            <div className="assistant-msg__bubble">
                                {msg.role === 'user' ? (
                                    <div className="assistant-msg__content">{msg.content}</div>
                                ) : (
                                    <div className="md-renderer">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {msg.content || (msg.parts && msg.parts.find(p => p.type === 'text')?.content) || ''}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="assistant-footer">
                <div className="assistant-input-wrapper">
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                        placeholder={hasModels ? 'Ask the assistant...' : 'Configure a model in Settings first'}
                        className="assistant-input"
                        rows={1}
                        disabled={!hasModels}
                    />
                    <button 
                        className="assistant-submit"
                        onClick={handleSend}
                        disabled={!input.trim() || !hasModels}
                        title="Send message"
                    >
                        <Send size={14} />
                    </button>
                </div>
                <div className="assistant-footer__hint">
                    Assistant automatically manipulates the canvas based on your prompt.
                </div>
            </div>
        </div>
    )
}
