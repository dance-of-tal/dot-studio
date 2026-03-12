import { useState, useCallback, useRef, useEffect } from 'react'
import { api } from '../api'

export interface FileMention {
    name: string
    path: string
    absolute: string
    type: string
}

export function useFileMentions() {
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionResults, setMentionResults] = useState<FileMention[]>([])
    const [mentionIndex, setMentionIndex] = useState(0)
    const [isMentioning, setIsMentioning] = useState(false)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const mentionRegex = /@([a-zA-Z0-9_\-\.\/]*)$/

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
        } else {
            setIsMentioning(false)
            setMentionQuery(null)
            setMentionResults([])
        }
    }, [])

    useEffect(() => {
        if (mentionQuery === null) return

        let active = true
        async function fetchFiles() {
            try {
                const res = await api.workspace.findFiles(mentionQuery || '')
                if (active) {
                    setMentionResults(res.filter(f => f.type === 'file'))
                    setMentionIndex(0)
                }
            } catch (err) {
                console.error("Mention search error", err)
            }
        }

        const timer = setTimeout(fetchFiles, 150)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [mentionQuery])

    const extractMentionText = useCallback(() => {
        if (!inputRef.current) return null
        const cursor = inputRef.current.selectionStart
        const text = inputRef.current.value
        const textBeforeCursor = text.slice(0, cursor)

        const match = mentionRegex.exec(textBeforeCursor)
        if (!match) return null

        const startIndex = match.index
        const newText = text.slice(0, startIndex) + text.slice(cursor)

        setIsMentioning(false)
        setMentionQuery(null)
        setMentionResults([])

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
        setIsMentioning
    }
}
