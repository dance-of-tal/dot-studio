import type { RefObject } from 'react'
import { Send, Square } from 'lucide-react'
import type { PerformerNode } from '../../types'
import type { TurnDanceSelection, DanceSearchItem } from './agent-frame-utils'
import ComposerPillBar from './ComposerPillBar'
import ComposerMentionMenus from './ComposerMentionMenus'
import ComposerRuntimeRow from './ComposerRuntimeRow'
import PermissionDock from './PermissionDock'
import QuestionWizard from './QuestionWizard'

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
        isFileMentioning,
        fileMentionResults,
        fileMentionIndex,
        extractFileMentionText,
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

            <ComposerPillBar
                mentionedPerformers={mentionedPerformers}
                setMentionedPerformers={setMentionedPerformers}
                turnDanceSelections={turnDanceSelections}
                setTurnDanceSelections={setTurnDanceSelections}
                attachments={attachments}
                setAttachments={setAttachments}
            />

            <ComposerMentionMenus
                input={input}
                setInput={setInput}
                inputRef={inputRef}
                isPerformerMentioning={isPerformerMentioning}
                performerMentionResults={performerMentionResults}
                performerMentionIndex={performerMentionIndex}
                extractPerformerMentionText={extractPerformerMentionText}
                setMentionedPerformers={setMentionedPerformers}
                isFileMentioning={isFileMentioning}
                fileMentionResults={fileMentionResults}
                fileMentionIndex={fileMentionIndex}
                extractFileMentionText={extractFileMentionText}
                setAttachments={setAttachments}
                danceSlashMatch={danceSlashMatch}
                danceSearchSections={danceSearchSections}
                danceSearchResults={danceSearchResults}
                danceSearchIndex={danceSearchIndex}
                addTurnDanceSelection={addTurnDanceSelection}
                showSlashMenu={showSlashMenu}
                setShowSlashMenu={setShowSlashMenu}
                slashIndex={slashIndex}
                filteredCommands={filteredCommands}
                performerId={performerId}
                executeSlashCommand={executeSlashCommand}
            />

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

            <ComposerRuntimeRow
                performerId={performerId}
                performer={performer}
                selectedAgentId={selectedAgentId}
                buildAgent={buildAgent}
                planAgent={planAgent}
                safeSummary={safeSummary}
                onSetAgentId={onSetAgentId}
                onSetModelVariant={onSetModelVariant}
                onSetExecutionMode={onSetExecutionMode}
            />
        </div>
    )
}
