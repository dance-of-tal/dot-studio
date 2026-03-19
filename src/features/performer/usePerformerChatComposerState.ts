import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStudioStore } from '../../store'
import { useSlashCommands } from '../../hooks/useSlashCommands'
import { useFileMentions, type FileMention } from '../../hooks/useFileMentions'
import { usePerformerMention, type PerformerMention } from '../../hooks/usePerformerMention'
import { assetRefKey } from '../../lib/performers'
import { showToast } from '../../lib/toast'
import type { AssetCard, DraftAsset, PerformerNode } from '../../types'
import { buildDanceSearchSections, formatChatAttachments } from './agent-frame-utils'
import type { DanceSearchItem, TurnDanceSelection } from './agent-frame-utils'

type Args = {
    performerId: string
    performer: PerformerNode | null
    modelConfigured: boolean
    isLoading: boolean
    runtimeTools: {
        resolvedTools: string[]
        selectedMcpServers: string[]
        unavailableDetails: Array<{ serverName: string; reason: string }>
    } | null
    danceAssets: AssetCard[]
    drafts: Record<string, DraftAsset>
}

export function usePerformerChatComposerState({
    performerId,
    performer,
    modelConfigured,
    isLoading,
    runtimeTools,
    danceAssets,
    drafts,
}: Args) {
    const { sendMessage, executeSlashCommand } = useStudioStore()

    const [input, setInput] = useState('')
    const [attachments, setAttachments] = useState<FileMention[]>([])
    const [mentionedPerformers, setMentionedPerformers] = useState<PerformerMention[]>([])
    const [turnDanceSelections, setTurnDanceSelections] = useState<TurnDanceSelection[]>([])
    const [danceSearchIndex, setDanceSearchIndex] = useState(0)
    const composerInputRef = useRef<HTMLTextAreaElement>(null)

    const {
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        handleInputChange: onSlashInputChange,
        handleKeyDown: onSlashKeyDown,
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

    const danceSearchSections = useMemo(
        () => buildDanceSearchSections(danceAssets, danceSlashMatch, drafts, performer),
        [danceAssets, danceSlashMatch, drafts, performer],
    )

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

    useEffect(() => {
        setDanceSearchIndex(0)
    }, [danceSlashMatch])

    const handleSend = useCallback(() => {
        if (!input.trim() || isLoading || !modelConfigured || danceSlashMatch !== null) return
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

        if (/^\/(share)$/.test(text)) {
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
    }, [
        attachments,
        danceSlashMatch,
        executeSlashCommand,
        input,
        isLoading,
        mentionedPerformers,
        modelConfigured,
        performerId,
        runtimeTools,
        sendMessage,
        setIsFileMentioning,
        setIsPerformerMentioning,
        setShowSlashMenu,
        turnDanceSelections,
    ])

    const handleInputChange = (value: string) => {
        onSlashInputChange(value)
        checkPerformerMention(value, inputRef.current?.selectionStart ?? value.length)
        checkFileMention(value, inputRef.current?.selectionStart ?? value.length)
    }

    const handleKeyDownWrapper = (e: React.KeyboardEvent) => {
        if ((e.nativeEvent as any).isComposing) return

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
                if (newText !== null) {
                    setInput(newText)
                    setAttachments((current) => [...current, selectedFile])
                }
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
            Array.from(e.dataTransfer.files).forEach((file) => {
                const reader = new FileReader()
                reader.onload = (event) => {
                    if (event.target?.result) {
                        setAttachments((current) => [...current, {
                            name: file.name,
                            path: file.name,
                            absolute: event.target.result as string,
                            type: file.type,
                        }])
                    }
                }
                reader.readAsDataURL(file)
            })
        }
        e.dataTransfer.clearData()
    }

    return {
        input,
        setInput,
        attachments,
        setAttachments,
        mentionedPerformers,
        setMentionedPerformers,
        turnDanceSelections,
        setTurnDanceSelections,
        danceSearchIndex,
        setDanceSearchIndex,
        composerInputRef,
        inputRef,
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        isFileMentioning,
        fileMentionResults,
        fileMentionIndex,
        setFileMentionIndex,
        checkFileMention,
        extractFileMentionText,
        setIsFileMentioning,
        isPerformerMentioning,
        performerMentionResults,
        performerMentionIndex,
        setPerformerMentionIndex,
        checkPerformerMention,
        extractPerformerMentionText,
        setIsPerformerMentioning,
        danceSlashMatch,
        danceSearchSections,
        danceSearchResults,
        addTurnDanceSelection,
        handleSend,
        handleInputChange,
        handleKeyDownWrapper,
        handleDrop,
    }
}
