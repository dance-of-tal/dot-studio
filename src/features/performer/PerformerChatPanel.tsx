/**
 * PerformerChatPanel — Chat mode panel for performer conversation.
 * Extracted from AgentFrame. Includes ThreadBody, MessageActionBar,
 * composer with slash/dance/mention/file menus, runtime controls.
 */
import { useState, useCallback, useMemo, useRef, useEffect, type RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { api } from '../../api'

import { useStudioStore } from '../../store'
import { useSlashCommands } from '../../hooks/useSlashCommands'
import { useFileMentions, type FileMention } from '../../hooks/useFileMentions'
import { usePerformerMention, type PerformerMention } from '../../hooks/usePerformerMention'
import { assetRefKey } from '../../lib/performers'
import { showToast } from '../../lib/toast'
import type { ChatMessage, AssetCard, DraftAsset, PerformerNode } from '../../types'

import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import MessageActionBar from '../chat/MessageActionBar'
import RevertConfirmModal from '../../components/chat/RevertConfirmModal'
import PerformerChatComposer from './PerformerChatComposer'

import {
    buildDanceSearchSections,
    formatChatAttachments,
    shouldShowChatLoading,
} from './agent-frame-utils'
import type { TurnDanceSelection, DanceSearchItem } from './agent-frame-utils'

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
                    <PerformerChatComposer
                        performerId={performerId}
                        performer={performer}
                        input={input}
                        setInput={setInput}
                        isLoading={isLoading}
                        modelConfigured={modelConfigured}
                        sessionId={sessionId}
                        selectedAgentId={selectedAgentId}
                        buildAgent={buildAgent}
                        planAgent={planAgent}
                        safeSummary={safeSummary}
                        attachments={attachments}
                        setAttachments={setAttachments}
                        mentionedPerformers={mentionedPerformers}
                        setMentionedPerformers={setMentionedPerformers}
                        turnDanceSelections={turnDanceSelections}
                        setTurnDanceSelections={setTurnDanceSelections}
                        composerInputRef={composerInputRef}
                        inputRef={inputRef}
                        handleDrop={handleDrop}
                        handleInputChange={handleInputChange}
                        handleKeyDownWrapper={handleKeyDownWrapper}
                        handleSend={handleSend}
                        abortChat={abortChat}
                        executeSlashCommand={executeSlashCommand}
                        danceSlashMatch={danceSlashMatch}
                        danceSearchSections={danceSearchSections}
                        danceSearchResults={danceSearchResults}
                        danceSearchIndex={danceSearchIndex}
                        addTurnDanceSelection={addTurnDanceSelection}
                        showSlashMenu={showSlashMenu}
                        setShowSlashMenu={setShowSlashMenu}
                        slashIndex={slashIndex}
                        filteredCommands={filteredCommands}
                        isPerformerMentioning={isPerformerMentioning}
                        performerMentionResults={performerMentionResults}
                        performerMentionIndex={performerMentionIndex}
                        extractPerformerMentionText={extractPerformerMentionText}
                        setMentionedPerformerIndex={setPerformerMentionIndex}
                        setIsPerformerMentioning={setIsPerformerMentioning}
                        isFileMentioning={isFileMentioning}
                        fileMentionResults={fileMentionResults}
                        fileMentionIndex={fileMentionIndex}
                        extractFileMentionText={extractFileMentionText}
                        setFileMentionIndex={setFileMentionIndex}
                        setIsFileMentioning={setIsFileMentioning}
                        checkPerformerMention={checkPerformerMention}
                        checkFileMention={checkFileMention}
                        pendingPermissions={pendingPermissions}
                        pendingQuestions={pendingQuestions}
                        isRespondingToPermission={isRespondingToPermission}
                        setIsRespondingToPermission={setIsRespondingToPermission}
                        respondToPermission={respondToPermission}
                        respondToQuestion={respondToQuestion}
                        rejectQuestion={rejectQuestion}
                        onSetAgentId={onSetAgentId}
                        onSetModelVariant={onSetModelVariant}
                        onSetExecutionMode={onSetExecutionMode}
                    />
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
