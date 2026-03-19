import { useEffect, useState, type RefObject } from 'react'
import { Send, Square, File as FileIcon, X, Sparkles, Hammer, Lightbulb, Shield, Zap } from 'lucide-react'
import { loadMaterialFileIconForPath } from '../../lib/material-file-icons'
import { assetRefKey } from '../../lib/performers'
import type { AssetCard, DraftAsset, PerformerNode } from '../../types'
import ModelVariantSelect from './ModelVariantSelect'
import PermissionDock from './PermissionDock'
import QuestionWizard from './QuestionWizard'
import type { TurnDanceSelection, DanceSearchItem } from './agent-frame-utils'

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

type Props = {
    performerId: string
    performer: PerformerNode | null
    input: string
    setInput: (value: string) => void
    isLoading: boolean
    modelConfigured: boolean
    sessionId: string | null
    selectedAgentId: string
    buildAgent: { name: string; description?: string } | null
    planAgent: { name: string; description?: string } | null
    safeSummary: any
    attachments: any[]
    setAttachments: React.Dispatch<React.SetStateAction<any[]>>
    mentionedPerformers: any[]
    setMentionedPerformers: React.Dispatch<React.SetStateAction<any[]>>
    turnDanceSelections: TurnDanceSelection[]
    setTurnDanceSelections: React.Dispatch<React.SetStateAction<TurnDanceSelection[]>>
    composerInputRef: RefObject<HTMLTextAreaElement | null>
    inputRef: RefObject<HTMLTextAreaElement | null>
    handleDrop: (e: React.DragEvent) => void
    handleInputChange: (value: string) => void
    handleKeyDownWrapper: (e: React.KeyboardEvent) => void
    handleSend: () => void
    abortChat: (performerId: string) => void
    executeSlashCommand: (performerId: string, command: string) => void
    danceSlashMatch: string | null
    danceSearchSections: Array<{ key: string; title: string; items: DanceSearchItem[] }>
    danceSearchResults: DanceSearchItem[]
    danceSearchIndex: number
    addTurnDanceSelection: (item: DanceSearchItem) => void
    showSlashMenu: boolean
    setShowSlashMenu: (value: boolean) => void
    slashIndex: number
    filteredCommands: Array<{ cmd: string; desc: string; mode: 'compose' | 'execute' }>
    isPerformerMentioning: boolean
    performerMentionResults: any[]
    performerMentionIndex: number
    extractPerformerMentionText: () => string | null
    setMentionedPerformerIndex: React.Dispatch<React.SetStateAction<number>>
    setIsPerformerMentioning: (value: boolean) => void
    isFileMentioning: boolean
    fileMentionResults: any[]
    fileMentionIndex: number
    extractFileMentionText: () => string | null
    setFileMentionIndex: React.Dispatch<React.SetStateAction<number>>
    setIsFileMentioning: (value: boolean) => void
    checkPerformerMention: () => void
    checkFileMention: () => void
    pendingPermissions: Record<string, any>
    pendingQuestions: Record<string, any>
    isRespondingToPermission: boolean
    setIsRespondingToPermission: React.Dispatch<React.SetStateAction<boolean>>
    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: Record<string, string[]>) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
    onSetAgentId: (id: string, agentId: string | null) => void
    onSetModelVariant: (id: string, variant: string | null) => void
    onSetExecutionMode: () => void
}

export default function PerformerChatComposer(props: Props) {
    const {
        performerId,
        performer,
        input,
        setInput,
        isLoading,
        modelConfigured,
        sessionId,
        selectedAgentId,
        buildAgent,
        planAgent,
        safeSummary,
        attachments,
        setAttachments,
        mentionedPerformers,
        setMentionedPerformers,
        turnDanceSelections,
        setTurnDanceSelections,
        composerInputRef,
        inputRef,
        handleDrop,
        handleInputChange,
        handleKeyDownWrapper,
        handleSend,
        abortChat,
        executeSlashCommand,
        danceSlashMatch,
        danceSearchSections,
        danceSearchResults,
        danceSearchIndex,
        addTurnDanceSelection,
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        isPerformerMentioning,
        performerMentionResults,
        performerMentionIndex,
        extractPerformerMentionText,
        setMentionedPerformerIndex,
        setIsPerformerMentioning,
        isFileMentioning,
        fileMentionResults,
        fileMentionIndex,
        extractFileMentionText,
        setFileMentionIndex,
        setIsFileMentioning,
        checkPerformerMention,
        checkFileMention,
        pendingPermissions,
        pendingQuestions,
        isRespondingToPermission,
        setIsRespondingToPermission,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
        onSetAgentId,
        onSetModelVariant,
        onSetExecutionMode,
    } = props

    const isPlanAgent = selectedAgentId === 'plan'

    return (
        <div
            className="chat-input"
            style={{ position: 'relative' }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
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
                    {attachments.map((attachment, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px' }}>
                            <FileIcon size={10} style={{ marginRight: '4px' }} />
                            {attachment.name}
                            <X size={10} style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={() => setAttachments((current) => current.filter((_, index) => index !== idx))} />
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
                                if (newText !== null) {
                                    setInput(newText)
                                    setAttachments((current) => [...current, file])
                                }
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
                    {filteredCommands.map((command, i) => (
                        <div
                            key={command.cmd}
                            className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                            onClick={() => {
                                if (command.mode === 'compose') {
                                    setInput(`${command.cmd} `)
                                } else {
                                    executeSlashCommand(performerId, command.cmd)
                                    setInput('')
                                }
                                setShowSlashMenu(false)
                            }}
                        >
                            <span className="slash-cmd">{command.cmd}</span>
                            <span className="slash-desc">{command.desc}</span>
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
                            onClick={(event) => { event.stopPropagation() }}
                            title="Review safe mode changes"
                            type="button"
                        >
                            <span>Review</span>
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
