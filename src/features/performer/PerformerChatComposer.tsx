import type { RefObject } from 'react'
import type { PermissionRequest, QuestionAnswer, QuestionRequest } from '@opencode-ai/sdk/v2'
import { Send, Square } from 'lucide-react'
import type { PerformerNode } from '../../types'
import type { FileMention } from '../../hooks/useFileMentions'
import type { TurnDanceSelection, DanceSearchItem } from './agent-frame-utils'
import ComposerPillBar from './ComposerPillBar'
import ComposerMentionMenus from './ComposerMentionMenus'
import ComposerRuntimeRow from './ComposerRuntimeRow'
import PermissionDock from './PermissionDock'
import QuestionWizard from './QuestionWizard'
import { usePermissionInteraction } from '../../hooks/usePermissionInteraction'

type Props = {
    performerId: string
    performer: PerformerNode | null
    input: string
    setInput: (value: string) => void
    isLoading: boolean
    canAbort: boolean
    modelConfigured: boolean
    sessionId: string | null
    selectedAgentId: string
    buildAgent: { name: string; description?: string } | null
    planAgent: { name: string; description?: string } | null
    attachments: FileMention[]
    setAttachments: React.Dispatch<React.SetStateAction<FileMention[]>>
    turnDanceSelections: TurnDanceSelection[]
    setTurnDanceSelections: React.Dispatch<React.SetStateAction<TurnDanceSelection[]>>
    inputRef: RefObject<HTMLTextAreaElement | null>
    handleDrop: (e: React.DragEvent) => void
    handlePaste: (e: React.ClipboardEvent) => void
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
    isFileMentioning: boolean
    fileMentionResults: FileMention[]
    fileMentionIndex: number
    extractFileMentionText: () => string | null
    setFileMentionIndex: React.Dispatch<React.SetStateAction<number>>
    setIsFileMentioning: (value: boolean) => void
    checkFileMention: () => void
    permissionRequest: PermissionRequest | null
    questionRequest: QuestionRequest | null
    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: QuestionAnswer[]) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
    onSetAgentId: (id: string, agentId: string | null) => void
    onSetModelVariant: (id: string, variant: string | null) => void
}

export default function PerformerChatComposer(props: Props) {
    const {
        performerId,
        performer,
        input,
        setInput,
        isLoading,
        canAbort,
        modelConfigured,
        sessionId,
        selectedAgentId,
        buildAgent,
        planAgent,
        attachments,
        setAttachments,
        turnDanceSelections,
        setTurnDanceSelections,
        inputRef,
        handleDrop,
        handlePaste,
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
        isFileMentioning,
        fileMentionResults,
        fileMentionIndex,
        extractFileMentionText,
        checkFileMention,
        permissionRequest,
        questionRequest,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
        onSetAgentId,
        onSetModelVariant,
    } = props

    const {
        isResponding: isRespondingToPermission,
        permissionRequest: activePermissionRequest,
        questionRequest: activeQuestionRequest,
        handlePermissionDecide,
        handleQuestionRespond,
        handleQuestionReject,
    } = usePermissionInteraction({
        sessionId,
        permissionRequest,
        questionRequest,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
    })

    const isPlanAgent = selectedAgentId === 'plan'

    return (
        <div
            className="chat-input"
            style={{ position: 'relative' }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
        >
            <ComposerPillBar
                turnDanceSelections={turnDanceSelections}
                setTurnDanceSelections={setTurnDanceSelections}
                attachments={attachments}
                setAttachments={setAttachments}
            />

            <ComposerMentionMenus
                input={input}
                setInput={setInput}
                inputRef={inputRef}
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

            {activePermissionRequest ? (
                <PermissionDock
                    request={activePermissionRequest}
                    responding={isRespondingToPermission}
                    onDecide={handlePermissionDecide}
                />
            ) : null}

            {activeQuestionRequest ? (
                <QuestionWizard
                    key={activeQuestionRequest.id}
                    request={activeQuestionRequest}
                    responding={isRespondingToPermission}
                    onRespond={handleQuestionRespond}
                    onReject={handleQuestionReject}
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
                    onKeyUp={() => { checkFileMention() }}
                    onMouseUp={() => { checkFileMention() }}
                    onKeyDown={handleKeyDownWrapper}
                    onPaste={handlePaste}
                    placeholder={!modelConfigured
                        ? 'Select a model before chatting'
                        : isPlanAgent
                            ? 'Plan mode — ask for a plan...'
                            : 'Message... (# files, / to use dance for this turn)'}
                    disabled={isLoading}
                    rows={1}
                    className="text-input"
                />
                {canAbort ? (
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
                onSetAgentId={onSetAgentId}
                onSetModelVariant={onSetModelVariant}
            />
        </div>
    )
}
