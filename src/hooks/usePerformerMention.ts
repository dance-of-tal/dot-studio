import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { useStudioStore } from '../store'

export interface PerformerMention {
    performerId: string
    name: string
}

export function usePerformerMention(currentPerformerId: string, externalInputRef?: RefObject<HTMLTextAreaElement | null>) {
    const performers = useStudioStore((state) => state.performers)
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = useState(0)
    const [isMentioning, setIsMentioning] = useState(false)
    const fallbackRef = useRef<HTMLTextAreaElement>(null)
    const inputRef = externalInputRef || fallbackRef

    const mentionRegex = /@([a-zA-Z0-9_\-\.]*)$/

    const mentionResults = useMemo(() => {
        if (!mentionQuery && mentionQuery !== '') {
            return []
        }
        const query = mentionQuery.toLowerCase()
        return performers
            .filter((performer) => performer.id !== currentPerformerId)
            .filter((performer) => !query || performer.name.toLowerCase().includes(query))
            .map((performer) => ({
                performerId: performer.id,
                name: performer.name,
            }))
            .slice(0, 8)
    }, [currentPerformerId, mentionQuery, performers])

    const checkMention = useCallback((value?: string, cursorPosition?: number | null) => {
        const input = inputRef.current
        const sourceValue = typeof value === 'string' ? value : input?.value
        const cursor = typeof cursorPosition === 'number' ? cursorPosition : input?.selectionStart
        if (typeof sourceValue !== 'string' || typeof cursor !== 'number') {
            return
        }

        const textBeforeCursor = sourceValue.slice(0, cursor)
        const match = mentionRegex.exec(textBeforeCursor)
        if (match) {
            setIsMentioning(true)
            setMentionQuery(match[1])
            setMentionIndex(0)
            return
        }

        setIsMentioning(false)
        setMentionQuery(null)
    }, [])

    const extractMentionText = useCallback(() => {
        if (!inputRef.current) {
            return null
        }

        const cursor = inputRef.current.selectionStart
        const text = inputRef.current.value
        const textBeforeCursor = text.slice(0, cursor)
        const match = mentionRegex.exec(textBeforeCursor)
        if (!match) {
            return null
        }

        const startIndex = match.index
        const newText = text.slice(0, startIndex) + text.slice(cursor)
        setIsMentioning(false)
        setMentionQuery(null)
        return newText
    }, [])

    return {
        inputRef,
        isMentioning,
        mentionResults,
        mentionIndex,
        setMentionIndex,
        checkMention,
        extractMentionText,
        setIsMentioning,
    }
}
