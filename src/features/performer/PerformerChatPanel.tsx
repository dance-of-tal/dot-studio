/**
 * PerformerChatPanel — chat shell for performer conversation.
 *
 * Responsibilities:
 * - wire store actions to the performer thread view
 * - host composer state hook
 * - manage revert confirmation modal
 */
import { useState, type RefObject } from 'react'
import { useStudioStore } from '../../store'
import type { ChatMessage, AssetCard, DraftAsset, PerformerNode } from '../../types'
import RevertConfirmModal from '../../components/chat/RevertConfirmModal'
import PerformerChatComposer from './PerformerChatComposer'
import PerformerThreadView from './PerformerThreadView'
import { usePerformerChatComposerState } from './usePerformerChatComposerState'
import { selectPendingPermission, selectPendingQuestion } from '../../store/session'

type PerformerChatPanelProps = {
    performerId: string
    performer: PerformerNode | null
    messages: ChatMessage[]
    prefixCount: number
    isLoading: boolean
    canAbort: boolean
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
}

export default function PerformerChatPanel({
    performerId,
    performer,
    messages,
    prefixCount,
    isLoading,
    canAbort,
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
}: PerformerChatPanelProps) {
    const {
        abortChat,
        executeSlashCommand,
        revertSession,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
    } = useStudioStore()

    const [revertTarget, setRevertTarget] = useState<{ performerId: string; messageId: string; messageContent: string } | null>(null)
    const [isRevertConfirming, setIsRevertConfirming] = useState(false)
    const composerState = usePerformerChatComposerState({
        performerId,
        performer,
        modelConfigured,
        isLoading,
        runtimeTools,
        danceAssets,
        drafts,
    })
    const permissionRequest = useStudioStore((state) => (
        sessionId ? selectPendingPermission(state, sessionId) : null
    ))
    const questionRequest = useStudioStore((state) => (
        sessionId ? selectPendingQuestion(state, sessionId) : null
    ))

    return (
        <>
            <PerformerThreadView
                performerId={performerId}
                messages={messages}
                prefixCount={prefixCount}
                isLoading={isLoading}
                hasActiveSession={hasActiveSession}
                chatEndRef={chatEndRef}
                onOpenRevert={(pid, mid, content) => setRevertTarget({ performerId: pid, messageId: mid, messageContent: content })}
                composer={(
                    <PerformerChatComposer
                        performerId={performerId}
                        performer={performer}
                        input={composerState.input}
                        setInput={composerState.setInput}
                        isLoading={isLoading}
                        canAbort={canAbort}
                        modelConfigured={modelConfigured}
                        sessionId={sessionId}
                        selectedAgentId={selectedAgentId}
                        buildAgent={buildAgent}
                        planAgent={planAgent}
                        attachments={composerState.attachments}
                        setAttachments={composerState.setAttachments}
                        turnDanceSelections={composerState.turnDanceSelections}
                        setTurnDanceSelections={composerState.setTurnDanceSelections}
                        inputRef={composerState.inputRef}
                        handleDrop={composerState.handleDrop}
                        handlePaste={composerState.handlePaste}
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
                        isFileMentioning={composerState.isFileMentioning}
                        fileMentionResults={composerState.fileMentionResults}
                        fileMentionIndex={composerState.fileMentionIndex}
                        extractFileMentionText={composerState.extractFileMentionText}
                        setFileMentionIndex={composerState.setFileMentionIndex}
                        setIsFileMentioning={composerState.setIsFileMentioning}
                        checkFileMention={composerState.checkFileMention}
                        permissionRequest={permissionRequest}
                        questionRequest={questionRequest}
                        respondToPermission={respondToPermission}
                        respondToQuestion={respondToQuestion}
                        rejectQuestion={rejectQuestion}
                        onSetAgentId={onSetAgentId}
                        onSetModelVariant={onSetModelVariant}
                    />
                )}
            />
            {revertTarget ? (
                <RevertConfirmModal
                    messagePreview={revertTarget.messageContent}
                    submitting={isRevertConfirming}
                    onConfirm={async () => {
                        const content = revertTarget.messageContent
                        setIsRevertConfirming(true)
                        try {
                            await revertSession(revertTarget.performerId, revertTarget.messageId)
                            setRevertTarget(null)
                            composerState.setInput(content)
                            setTimeout(() => composerState.composerInputRef.current?.focus(), 50)
                        } finally {
                            setIsRevertConfirming(false)
                        }
                    }}
                    onCancel={() => {
                        if (isRevertConfirming) return
                        setRevertTarget(null)
                    }}
                />
            ) : null}
        </>
    )
}
