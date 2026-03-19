/**
 * PerformerChatPanel — chat shell for performer conversation.
 *
 * Responsibilities:
 * - wire store actions to the performer thread view
 * - host composer state hook
 * - manage revert confirmation modal
 */
import { useState, useMemo, useRef, useEffect, type RefObject } from 'react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import type { ChatMessage, AssetCard, DraftAsset, PerformerNode } from '../../types'
import RevertConfirmModal from '../../components/chat/RevertConfirmModal'
import PerformerChatComposer from './PerformerChatComposer'
import PerformerThreadView from './PerformerThreadView'
import { usePerformerChatComposerState } from './usePerformerChatComposerState'

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

    const [isRespondingToPermission, setIsRespondingToPermission] = useState(false)
    const [revertTarget, setRevertTarget] = useState<{ performerId: string; messageId: string; messageContent: string } | null>(null)
    const [hasGit, setHasGit] = useState<boolean | null>(null)

    useEffect(() => {
        let active = true
        api.vcs.get()
            .then((result: any) => {
                if (!active) return
                setHasGit(!!result)
            })
            .catch(() => {
                if (!active) return
                setHasGit(false)
            })
        return () => { active = false }
    }, [])

    const lastMessageId = messages[messages.length - 1]?.id || null
    const canUndoLastTurn = useMemo(
        () => hasActiveSession && messages.some((message) => message.role === 'user') && !isLoading,
        [hasActiveSession, isLoading, messages],
    )

    const composerState = usePerformerChatComposerState({
        performerId,
        performer,
        modelConfigured,
        isLoading,
        runtimeTools,
        danceAssets,
        drafts,
    })

    return (
        <>
            <PerformerThreadView
                performerId={performerId}
                messages={messages}
                prefixCount={prefixCount}
                isLoading={isLoading}
                hasActiveSession={hasActiveSession}
                canUndoLastTurn={canUndoLastTurn}
                lastMessageId={lastMessageId}
                chatEndRef={chatEndRef}
                undoLastTurn={undoLastTurn}
                onOpenRevert={(pid, mid, content) => setRevertTarget({ performerId: pid, messageId: mid, messageContent: content })}
                composer={(
                    <PerformerChatComposer
                        performerId={performerId}
                        performer={performer}
                        input={composerState.input}
                        setInput={composerState.setInput}
                        isLoading={isLoading}
                        modelConfigured={modelConfigured}
                        sessionId={sessionId}
                        selectedAgentId={selectedAgentId}
                        buildAgent={buildAgent}
                        planAgent={planAgent}
                        safeSummary={safeSummary}
                        attachments={composerState.attachments}
                        setAttachments={composerState.setAttachments}
                        mentionedPerformers={composerState.mentionedPerformers}
                        setMentionedPerformers={composerState.setMentionedPerformers}
                        turnDanceSelections={composerState.turnDanceSelections}
                        setTurnDanceSelections={composerState.setTurnDanceSelections}
                        composerInputRef={composerState.composerInputRef}
                        inputRef={composerState.inputRef}
                        handleDrop={composerState.handleDrop}
                        handleInputChange={composerState.handleInputChange}
                        handleKeyDownWrapper={composerState.handleKeyDownWrapper}
                        handleSend={composerState.handleSend}
                        abortChat={abortChat}
                        executeSlashCommand={executeSlashCommand}
                        danceSlashMatch={composerState.danceSlashMatch}
                        danceSearchSections={composerState.danceSearchSections}
                        danceSearchResults={composerState.danceSearchResults}
                        danceSearchIndex={composerState.danceSearchIndex}
                        addTurnDanceSelection={composerState.addTurnDanceSelection}
                        showSlashMenu={composerState.showSlashMenu}
                        setShowSlashMenu={composerState.setShowSlashMenu}
                        slashIndex={composerState.slashIndex}
                        filteredCommands={composerState.filteredCommands}
                        isPerformerMentioning={composerState.isPerformerMentioning}
                        performerMentionResults={composerState.performerMentionResults}
                        performerMentionIndex={composerState.performerMentionIndex}
                        extractPerformerMentionText={composerState.extractPerformerMentionText}
                        setMentionedPerformerIndex={composerState.setPerformerMentionIndex}
                        setIsPerformerMentioning={composerState.setIsPerformerMentioning}
                        isFileMentioning={composerState.isFileMentioning}
                        fileMentionResults={composerState.fileMentionResults}
                        fileMentionIndex={composerState.fileMentionIndex}
                        extractFileMentionText={composerState.extractFileMentionText}
                        setFileMentionIndex={composerState.setFileMentionIndex}
                        setIsFileMentioning={composerState.setIsFileMentioning}
                        checkPerformerMention={composerState.checkPerformerMention}
                        checkFileMention={composerState.checkFileMention}
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
                        composerState.setInput(content)
                        setTimeout(() => composerState.composerInputRef.current?.focus(), 50)
                    }}
                    onCancel={() => setRevertTarget(null)}
                />
            ) : null}
        </>
    )
}
