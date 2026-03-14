/**
 * usePerformerMention – Performer @mention autocomplete hook.
 *
 * Triggers when the user types `@` in the chat input.
 * Provides a filtered list of performers (excluding self) for autocomplete.
 */

import { useState, useCallback, useRef, useMemo } from 'react'
import { useStudioStore } from '../store'
import type { PerformerNode } from '../types'

export interface PerformerMentionResult {
    performerId: string
    name: string
    modelLabel: string | null
    executionMode: 'direct' | 'safe'
}

export function usePerformerMention(selfPerformerId: string) {
    const [isMentioning, setIsMentioning] = useState(false)
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = useState(0)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const performers = useStudioStore((state) => state.performers)

    const mentionRegex = /@([a-zA-Z0-9_\-\. ]*)$/

    const mentionResults = useMemo<PerformerMentionResult[]>(() => {
        if (mentionQuery === null) return []

        const query = mentionQuery.toLowerCase().trim()
        return performers
            .filter((performer: PerformerNode) => performer.id !== selfPerformerId)
            .filter((performer: PerformerNode) =>
                !query || performer.name.toLowerCase().includes(query),
            )
            .map((performer: PerformerNode) => ({
                performerId: performer.id,
                name: performer.name,
                modelLabel: performer.model?.modelId || null,
                executionMode: performer.executionMode === 'safe' ? 'safe' as const : 'direct' as const,
            }))
    }, [mentionQuery, performers, selfPerformerId])

    const checkMention = useCallback((value?: string, cursorPosition?: number | null) => {
        const input = inputRef.current
        const sourceValue = typeof value === 'string' ? value : input?.value
        const cursor = typeof cursorPosition === 'number' ? cursorPosition : input?.selectionStart
        if (typeof sourceValue !== 'string' || typeof cursor !== 'number') return
        const textBeforeCursor = sourceValue.slice(0, cursor)
        const match = mentionRegex.exec(textBeforeCursor)

        if (match) {
            setIsMentioning(true)
            setMentionQuery(match[1])
            setMentionIndex(0)
        } else {
            setIsMentioning(false)
            setMentionQuery(null)
        }
    }, [])

    const selectMention = useCallback((result: PerformerMentionResult): {
        newText: string
        mention: { performerId: string }
    } | null => {
        if (!inputRef.current) return null
        const cursor = inputRef.current.selectionStart
        const text = inputRef.current.value
        const textBeforeCursor = text.slice(0, cursor)

        const match = mentionRegex.exec(textBeforeCursor)
        if (!match) return null

        const startIndex = match.index
        const afterCursor = text.slice(cursor)
        const insertText = `@${result.name} `
        const newText = text.slice(0, startIndex) + insertText + afterCursor

        setIsMentioning(false)
        setMentionQuery(null)

        return {
            newText,
            mention: { performerId: result.performerId },
        }
    }, [])

    return {
        inputRef,
        isMentioning,
        mentionResults,
        mentionIndex,
        setMentionIndex,
        checkMention,
        selectMention,
        setIsMentioning,
    }
}
