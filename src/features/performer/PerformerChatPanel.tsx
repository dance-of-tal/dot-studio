/**
 * PerformerChatPanel — Chat mode panel for performer conversation.
 * Extracted from AgentFrame. Includes ThreadBody, MessageActionBar,
 * composer with slash/dance/mention/file menus, runtime controls.
 */
import { useState, useCallback, useMemo, useRef, useEffect, type RefObject } from 'react'
import { Send, Square, File as FileIcon, X, Sparkles, Hammer, Lightbulb, Shield, Zap } from 'lucide-react'
import { api } from '../../api'

import { useStudioStore } from '../../store'
import { useSlashCommands } from '../../hooks/useSlashCommands'
import { useFileMentions, type FileMention } from '../../hooks/useFileMentions'
import { usePerformerMention, type PerformerMention } from '../../hooks/usePerformerMention'
import { assetRefKey } from '../../lib/performers'
import { showToast } from '../../lib/toast'
import { loadMaterialFileIconForPath } from '../../lib/material-file-icons'
import type { ChatMessage, AssetCard, DraftAsset, PerformerNode } from '../../types'

import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import MessageActionBar from '../chat/MessageActionBar'
import RevertConfirmModal from '../../components/chat/RevertConfirmModal'
import ModelVariantSelect from './ModelVariantSelect'
import PermissionDock from './PermissionDock'
import QuestionWizard from './QuestionWizard'

import {
    buildDanceSearchSections,
    formatChatAttachments,
    shouldShowChatLoading,
} from './agent-frame-utils'
import type { TurnDanceSelection, DanceSearchItem } from './agent-frame-utils'

/* ── Helpers ── */

function MentionFileIcon({ path }: { path: string }) {
    const [iconUrl, setIconUrl] = useState('')

    useEffect(() => {
        let active = true
        void loadMaterialFileIconForPath(path).then((url) => {
            if (active) setIconUrl(url)
        })
        return () => { active = false }
    }, [path])

    return (
        <span
            className="mention-result__icon"
            style={{
                ['--mention-icon' as string]: iconUrl ? `url(${iconUrl})` : 'none',
                background: iconUrl ? 'var(--text-secondary)' : 'transparent',
            }}
            aria-hidden="true"
        />
    )
}

/* ── Props ── */

type PerformerChatPanelProps = {
    performerId: string
    performer: PerformerNode | null
    messages: ChatMessage[]
    prefixCount: number
    isLoading: boolean
    sessionId: string | null
    hasActiveSession: boolean
    modelConfigured: boolean
    selectedAgentId: string
    buildAgent: { name: string; description?: string } | null
    planAgent: { name: string; description?: string } | null
    runtimeTools: {
        resolvedTools: string[]
        selectedMcpServers: string[]
        unavailableDetails: Array<{ serverName: string; reason: string }>
    } | null
    danceAssets: AssetCard[]
    drafts: Record<string, DraftAsset>
    chatEndRef: RefObject<HTMLDivElement | null>
    onSetAgentId: (id: string, agentId: string | null) => void
    onSetModelVariant: (id: string, variant: string | null) => void
    onSetExecutionMode: () => void
    safeSummary: any
}

export default function PerformerChatPanel({
    performerId,
    performer,
    messages,
    prefixCount,
    isLoading,
    sessionId,
    hasActiveSession,
    modelConfigured,
    selectedAgentId,
    buildAgent,
    planAgent,
    runtimeTools,
    danceAssets,
    drafts,
    chatEndRef,
    onSetAgentId,
    onSetModelVariant,
    onSetExecutionMode,
    safeSummary,
}: PerformerChatPanelProps) {
    const {
        sendMessage,
        abortChat,
        executeSlashCommand,
        undoLastTurn,
        revertSession,
        pendingPermissions,
        pendingQuestions,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
    } = useStudioStore()

    const [input, setInput] = useState('')
    const [attachments, setAttachments] = useState<FileMention[]>([])
    const [mentionedPerformers, setMentionedPerformers] = useState<PerformerMention[]>([])
    const [turnDanceSelections, setTurnDanceSelections] = useState<TurnDanceSelection[]>([])
    const [danceSearchIndex, setDanceSearchIndex] = useState(0)
    const [isRespondingToPermission, setIsRespondingToPermission] = useState(false)
    const [revertTarget, setRevertTarget] = useState<{ performerId: string; messageId: string; messageContent: string } | null>(null)
    const [hasGit, setHasGit] = useState<boolean | null>(null)
    const composerInputRef = useRef<HTMLTextAreaElement>(null)

    // Detect Git on mount
    useEffect(() => {
        let active = true
        api.vcs.get()
            .then((res: any) => {
                if (!active) return
                // If we get a valid response, the workspace has Git
                setHasGit(!!res)
            })
            .catch(() => {
                if (!active) return
                setHasGit(false)
            })
        return () => { active = false }
    }, [])

    const isPlanAgent = selectedAgentId === 'plan'
    const lastMessageId = messages[messages.length - 1]?.id || null

    const canUndoLastTurn = useMemo(
        () => hasActiveSession && messages.some((message) => message.role === 'user') && !isLoading,
        [hasActiveSession, isLoading, messages],
    )

    const {
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        handleInputChange: onSlashInputChange,
        handleKeyDown: onSlashKeyDown
    } = useSlashCommands(performerId, input, setInput)

    const {
        inputRef,
        isMentioning: isFileMentioning,
        mentionResults: fileMentionResults,
        mentionIndex: fileMentionIndex,
        setMentionIndex: setFileMentionIndex,
        checkMention: checkFileMention,
        extractMentionText: extractFileMentionText,
        setIsMentioning: setIsFileMentioning,
    } = useFileMentions(composerInputRef)

    const {
        isMentioning: isPerformerMentioning,
        mentionResults: performerMentionResults,
        mentionIndex: performerMentionIndex,
        setMentionIndex: setPerformerMentionIndex,
        checkMention: checkPerformerMention,
        extractMentionText: extractPerformerMentionText,
        setIsMentioning: setIsPerformerMentioning,
    } = usePerformerMention(performerId, composerInputRef)

    const danceSlashMatch = useMemo(() => {
        const trimmed = input.trimStart()
        if (!trimmed.startsWith('/')) return null
        return trimmed.slice(1).trim().toLowerCase()
    }, [input])

    const danceSearchSections = useMemo(() => {
        return buildDanceSearchSections(danceAssets, danceSlashMatch, drafts, performer)
    }, [danceAssets, danceSlashMatch, drafts, performer])

    const danceSearchResults = useMemo<DanceSearchItem[]>(
        () => danceSearchSections.flatMap((section) => section.items),
        [danceSearchSections],
    )

    const addTurnDanceSelection = useCallback((item: DanceSearchItem) => {
        setTurnDanceSelections((current) => (
            current.some((selection) => assetRefKey(selection.ref) === assetRefKey(item.ref))
                ? current
                : [...current, { ref: item.ref, label: item.label, scope: item.scope }]
        ))
        setInput('')
        setShowSlashMenu(false)
        setDanceSearchIndex(0)
        inputRef.current?.focus()
    }, [inputRef, setShowSlashMenu])

    useEffect(() => { setDanceSearchIndex(0) }, [danceSlashMatch])

    const handleSend = useCallback(() => {
        if (!input.trim() || isLoading) return
        if (!modelConfigured) return
        if (danceSlashMatch !== null) return
        const text = input.trim()
        setInput('')
        setShowSlashMenu(false)
        setIsFileMentioning(false)
        setIsPerformerMentioning(false)

        if (text === '/undo' || text === '/redo') {
            showToast('Use the Undo Last Turn button for performer undo.', 'info', {
                title: 'Undo moved',
                dedupeKey: `performer-undo-moved:${performerId}`,
            })
            return
        }

        const cmdPattern = /^\/(share)$/
        if (cmdPattern.test(text)) {
            executeSlashCommand(performerId, text)
            return
        }

        const formattedAttachments = formatChatAttachments(attachments)

        if (runtimeTools && runtimeTools.selectedMcpServers.length > 0 && runtimeTools.resolvedTools.length === 0 && runtimeTools.unavailableDetails.length > 0) {
            showToast(
                `Selected MCP servers are unavailable: ${runtimeTools.unavailableDetails.map((detail) => `${detail.serverName} (${detail.reason})`).join(', ')}.`,
                'error',
                { title: 'MCP tools unavailable', dedupeKey: `performer-mcp-block:${performerId}` },
            )
            return
        }

        if (runtimeTools && runtimeTools.resolvedTools.length > 0 && runtimeTools.unavailableDetails.length > 0) {
            showToast(
                `Some MCP tools are unavailable: ${runtimeTools.unavailableDetails.map((detail) => `${detail.serverName} (${detail.reason})`).join(', ')}.`,
                'warning',
                { title: 'Partial MCP availability', dedupeKey: `performer-mcp-warn:${performerId}` },
            )
        }

        sendMessage(
            performerId,
            text,
            formattedAttachments,
            turnDanceSelections.map((selection) => selection.ref),
            mentionedPerformers,
        )
        setAttachments([])
        setMentionedPerformers([])
        setTurnDanceSelections([])
    }, [input, isLoading, modelConfigured, danceSlashMatch, performerId, executeSlashCommand, setShowSlashMenu, attachments, sendMessage, setIsFileMentioning, setIsPerformerMentioning, turnDanceSelections, runtimeTools, mentionedPerformers])

    const handleInputChange = (val: string) => {
        onSlashInputChange(val)
        checkPerformerMention(val, inputRef.current?.selectionStart ?? val.length)
        checkFileMention(val, inputRef.current?.selectionStart ?? val.length)
    }

    const handleKeyDownWrapper = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return

        if (danceSlashMatch !== null) {
            if (danceSearchResults.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setDanceSearchIndex((i) => Math.min(i + 1, danceSearchResults.length - 1)); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setDanceSearchIndex((i) => Math.max(i - 1, 0)); return }
                if (e.key === 'Enter') { e.preventDefault(); addTurnDanceSelection(danceSearchResults[danceSearchIndex]); return }
            }
            if (e.key === 'Escape') { e.preventDefault(); setInput(''); setShowSlashMenu(false); setDanceSearchIndex(0); return }
        }

        if (isPerformerMentioning && performerMentionResults.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setPerformerMentionIndex((i) => (i < performerMentionResults.length - 1 ? i + 1 : i)); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setPerformerMentionIndex((i) => (i > 0 ? i - 1 : i)); return }
            if (e.key === 'Enter') {
                e.preventDefault()
                const selectedPerformer = performerMentionResults[performerMentionIndex]
                const newText = extractPerformerMentionText()
                if (newText !== null) {
                    setInput(newText)
                    setMentionedPerformers((current) => (
                        current.some((item) => item.performerId === selectedPerformer.performerId)
                            ? current
                            : [...current, selectedPerformer]
                    ))
                }
                return
            }
            if (e.key === 'Escape') { setIsPerformerMentioning(false); return }
        }

        if (isFileMentioning && fileMentionResults.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setFileMentionIndex((i) => (i < fileMentionResults.length - 1 ? i + 1 : i)); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setFileMentionIndex((i) => (i > 0 ? i - 1 : i)); return }
            if (e.key === 'Enter') {
                e.preventDefault()
                const selectedFile = fileMentionResults[fileMentionIndex]
                const newText = extractFileMentionText()
                if (newText !== null) { setInput(newText); setAttachments(prev => [...prev, selectedFile]) }
                return
            }
            if (e.key === 'Escape') { setIsFileMentioning(false); return }
        }

        const handled = onSlashKeyDown(e, (text) => {
            if (!modelConfigured) return
            sendMessage(performerId, text, [], turnDanceSelections.map((selection) => selection.ref), mentionedPerformers)
            setMentionedPerformers([])
            setTurnDanceSelections([])
        })
        if (!handled && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(file => {
                const reader = new FileReader()
                reader.onload = (event) => {
                    if (event.target?.result) {
                        setAttachments(prev => [...prev, {
                            name: file.name,
                            path: file.name,
                            absolute: event.target!.result as string,
                            type: file.type
                        }])
                    }
                }
                reader.readAsDataURL(file)
            })
        }
        e.dataTransfer.clearData()
    }

    return (
        <>
            <ThreadBody
                messages={messages}
                loading={shouldShowChatLoading(messages, isLoading)}
                renderEmpty={() => (
                    <div className="chat-empty-state">
                        <Sparkles size={28} className="empty-icon" />
                        <p className="empty-title">Start a conversation</p>
                        <p className="empty-subtitle">Send a message to begin</p>
                    </div>
                )}
                renderMessage={(msg, index) => {
                    const isCurrentSession = index >= prefixCount
                    return (
                        <div key={msg.id} className={`thread-msg thread-msg--${msg.role}`}>
                            {msg.role === 'user' ? (
                                <div className="user-input-box">
                                    <span className="user-input-text">{msg.content}</span>
                                </div>
                            ) : (
                                <ChatMessageContent message={msg} />
                            )}
                            {msg.role !== 'system' && isCurrentSession ? (
                                <MessageActionBar
                                    message={msg}
                                    performerId={performerId}
                                    isLastMessage={msg.id === lastMessageId}
                                    canUndo={canUndoLastTurn}
                                    canRevert={hasActiveSession}
                                    isLoading={isLoading}
                                    onUndo={undoLastTurn}
                                    onRevert={(pid, mid) => {
                                        setRevertTarget({ performerId: pid, messageId: mid, messageContent: msg.content })
                                    }}
                                />
                            ) : null}
                        </div>
                    )
                }}
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
                composer={(
                    <div
                        className="chat-input"
                        style={{ position: 'relative' }}
                        onDrop={handleDrop}
                        onDragOver={e => e.preventDefault()}
                    >
                        {mentionedPerformers.length > 0 ? (
                            <div className="chat-input__warning">
                                <strong>Performer request</strong>
                                <span>Mentioned performers use their own identity, but run in your current workspace.</span>
                            </div>
                        ) : null}
                        {(attachments.length > 0 || turnDanceSelections.length > 0 || mentionedPerformers.length > 0) && (
                            <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-main)' }}>
                                {mentionedPerformers.map((mention, idx) => (
                                    <div key={`${mention.performerId}:${idx}`} className="turn-option-pill">
                                        <Sparkles size={10} style={{ marginRight: '4px' }} />
                                        <span>{mention.name}</span>
                                        <span className="turn-option-pill__scope turn-option-pill__scope--local">performer</span>
                                        <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setMentionedPerformers((current) => current.filter((item) => item.performerId !== mention.performerId))} />
                                    </div>
                                ))}
                                {turnDanceSelections.map((selection, idx) => (
                                    <div key={`${selection.scope}:${assetRefKey(selection.ref) || idx}`} className="turn-option-pill">
                                        <Zap size={10} style={{ marginRight: '4px' }} />
                                        <span>{selection.label}</span>
                                        <span className={`turn-option-pill__scope turn-option-pill__scope--${selection.scope}`}>{selection.scope}</span>
                                        <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setTurnDanceSelections((current) => current.filter((_, currentIndex) => currentIndex !== idx))} />
                                    </div>
                                ))}
                                {attachments.map((att, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px' }}>
                                        <FileIcon size={10} style={{ marginRight: '4px' }} />
                                        {att.name}
                                        <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {isPerformerMentioning && performerMentionResults.length > 0 ? (
                            <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                                {performerMentionResults.map((performerMention, i) => (
                                    <div
                                        key={performerMention.performerId}
                                        className={`slash-menu-item mention-menu-item ${i === performerMentionIndex ? 'active' : ''}`}
                                        onClick={() => {
                                            const newText = extractPerformerMentionText()
                                            if (newText !== null) {
                                                setInput(newText)
                                                setMentionedPerformers((current) => (
                                                    current.some((item) => item.performerId === performerMention.performerId) ? current : [...current, performerMention]
                                                ))
                                            }
                                            inputRef.current?.focus()
                                        }}
                                    >
                                        <span className="mention-result__content">
                                            <span className="mention-result__name">{performerMention.name}</span>
                                            <span className="mention-result__path">Runs in this workspace</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {isFileMentioning && fileMentionResults.length > 0 ? (
                            <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                                {fileMentionResults.map((file, i) => (
                                    <div
                                        key={file.absolute}
                                        className={`slash-menu-item mention-menu-item ${i === fileMentionIndex ? 'active' : ''}`}
                                        onClick={() => {
                                            const newText = extractFileMentionText()
                                            if (newText !== null) { setInput(newText); setAttachments(prev => [...prev, file]) }
                                            inputRef.current?.focus()
                                        }}
                                    >
                                        <MentionFileIcon path={file.path} />
                                        <span className="mention-result__content">
                                            <span className="mention-result__name">{file.name}</span>
                                            <span className="mention-result__path">{file.path}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {danceSlashMatch !== null ? (
                            <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                                {danceSearchSections.length > 0 ? danceSearchSections.map((section) => (
                                    <div key={section.key} className="slash-menu__section">
                                        <div className="slash-menu__section-title">{section.title}</div>
                                        {section.items.map((item) => {
                                            const resultIndex = danceSearchResults.findIndex((candidate) => candidate.key === item.key)
                                            return (
                                                <div
                                                    key={item.key}
                                                    className={`slash-menu-item dance-menu-item ${resultIndex === danceSearchIndex ? 'active' : ''}`}
                                                    onClick={() => addTurnDanceSelection(item)}
                                                >
                                                    <span className={`dance-result__scope dance-result__scope--${item.scope}`}>{item.scope}</span>
                                                    <span className="mention-result__content">
                                                        <span className="mention-result__name">{item.label}</span>
                                                        <span className="mention-result__path">{item.subtitle}</span>
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )) : (
                                    <div className="slash-menu__section">
                                        <div className="slash-menu__section-title">Dance</div>
                                        <div className="slash-menu-item">
                                            <span className="slash-desc">No matching dances found.</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {danceSlashMatch === null && showSlashMenu && filteredCommands.length > 0 ? (
                            <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                                {filteredCommands.map((c, i) => (
                                    <div
                                        key={c.cmd}
                                        className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                                        onClick={() => {
                                            if (c.mode === 'compose') { setInput(`${c.cmd} `) } else { executeSlashCommand(performerId, c.cmd); setInput('') }
                                            setShowSlashMenu(false)
                                        }}
                                    >
                                        <span className="slash-cmd">{c.cmd}</span>
                                        <span className="slash-desc">{c.desc}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {sessionId && pendingPermissions[sessionId] ? (
                            <PermissionDock
                                request={pendingPermissions[sessionId]}
                                responding={isRespondingToPermission}
                                onDecide={async (response) => {
                                    setIsRespondingToPermission(true)
                                    await respondToPermission(sessionId, pendingPermissions[sessionId].id, response)
                                    setIsRespondingToPermission(false)
                                }}
                            />
                        ) : null}

                        {sessionId && pendingQuestions[sessionId] ? (
                            <QuestionWizard
                                request={pendingQuestions[sessionId]}
                                responding={isRespondingToPermission}
                                onRespond={async (answers: Record<string, string[]>) => {
                                    setIsRespondingToPermission(true)
                                    await respondToQuestion(sessionId, pendingQuestions[sessionId].id, answers)
                                    setIsRespondingToPermission(false)
                                }}
                                onReject={async () => {
                                    setIsRespondingToPermission(true)
                                    await rejectQuestion(sessionId, pendingQuestions[sessionId].id)
                                    setIsRespondingToPermission(false)
                                }}
                            />
                        ) : null}

                        <div className="chat-input__main">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => {
                                    handleInputChange(e.target.value)
                                    e.target.style.height = '0'
                                    e.target.style.height = `${e.target.scrollHeight}px`
                                    e.target.style.overflowY = e.target.scrollHeight > 102 ? 'auto' : 'hidden'
                                }}
                                onKeyUp={() => { checkPerformerMention(); checkFileMention() }}
                                onMouseUp={() => { checkPerformerMention(); checkFileMention() }}
                                onKeyDown={handleKeyDownWrapper}
                                placeholder={!modelConfigured
                                    ? 'Select a model before chatting'
                                    : isPlanAgent
                                        ? 'Plan mode — ask for a plan...'
                                        : 'Message... (@ performers, # files, / to use dance for this turn)'}
                                disabled={isLoading}
                                rows={1}
                                className="text-input"
                            />
                            {isLoading ? (
                                <button className="send-btn abort" onClick={() => abortChat(performerId)} title="Abort generation">
                                    <Square size={12} fill="currentColor" />
                                </button>
                            ) : (
                                <button className="send-btn" onClick={handleSend} disabled={!input.trim() || !modelConfigured || danceSlashMatch !== null}>
                                    <Send size={12} />
                                </button>
                            )}
                        </div>
                        <div className="chat-input__runtime-row">
                            <div className="chat-input__mode-group">
                                <button
                                    className={`mode-toggle ${selectedAgentId !== 'plan' ? 'is-active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); if (selectedAgentId !== 'build') onSetAgentId(performerId, 'build') }}
                                    title={buildAgent?.description || 'Build mode'}
                                    type="button"
                                >
                                    <Hammer size={12} />
                                    <span>Build</span>
                                </button>
                                <button
                                    className={`mode-toggle mode-plan ${isPlanAgent ? 'is-active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); if (selectedAgentId !== 'plan') onSetAgentId(performerId, 'plan') }}
                                    title={planAgent?.description || 'Plan mode'}
                                    type="button"
                                >
                                    <Lightbulb size={12} />
                                    <span>Plan</span>
                                </button>
                            </div>
                            <ModelVariantSelect
                                model={performer?.model || null}
                                value={performer?.modelVariant || null}
                                onChange={(value) => onSetModelVariant(performerId, value)}
                                className="chat-input__variant"
                                compact
                                titlePrefix="Performer variant"
                            />

                            <div className="chat-input__safe-group">
                                <button
                                    className={`mode-toggle mode-safe ${performer?.executionMode === 'safe' ? 'is-active' : ''}`}
                                    onClick={(event) => { event.stopPropagation(); void onSetExecutionMode() }}
                                    title={performer?.executionMode === 'safe' ? 'Switch default standalone run mode to Direct' : 'Switch default standalone run mode to Safe'}
                                    type="button"
                                >
                                    <Shield size={12} />
                                    <span>Safe</span>
                                </button>
                                {performer?.executionMode === 'safe' ? (
                                    <button
                                        className={`mode-toggle ${safeSummary?.pendingCount || safeSummary?.conflictCount ? 'is-active' : ''}`}
                                        onClick={(event) => { event.stopPropagation(); /* safe review handled by parent */ }}
                                        title="Review safe mode changes"
                                        type="button"
                                    >
                                        <span>Review</span>
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
            />
            {revertTarget ? (
                <RevertConfirmModal
                    messagePreview={revertTarget.messageContent}
                    hasGit={hasGit}
                    onConfirm={async () => {
                        const content = revertTarget.messageContent
                        await revertSession(revertTarget.performerId, revertTarget.messageId)
                        setRevertTarget(null)
                        // Restore the reverted message text into the input
                        setInput(content)
                        // Focus the input after a tick
                        setTimeout(() => composerInputRef.current?.focus(), 50)
                    }}
                    onCancel={() => setRevertTarget(null)}
                />
            ) : null}
        </>
    )
}
