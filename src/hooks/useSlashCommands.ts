import { useState, useCallback } from 'react'

const SLASH_COMMANDS = [
    { cmd: '/dance', desc: 'Add dance for this turn', mode: 'compose' as const },
]

export function useSlashCommands(input: string, setInput: (v: string) => void) {
    const [showSlashMenu, setShowSlashMenu] = useState(false)
    const [slashIndex, setSlashIndex] = useState(0)

    const filteredCommands = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.trim()))

    const handleInputChange = useCallback((val: string) => {
        setInput(val)
        if (val.startsWith('/')) {
            setShowSlashMenu(true)
            setSlashIndex(0)
        } else {
            setShowSlashMenu(false)
        }
    }, [setInput])

    const handleKeyDown = useCallback((e: React.KeyboardEvent, onSendText?: (text: string) => void) => {
        if (showSlashMenu && filteredCommands.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSlashIndex((prev) => (prev + 1) % filteredCommands.length)
                return true
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
                return true
            }
            if (e.key === 'Enter') {
                e.preventDefault()
                const selected = filteredCommands[slashIndex]
                if (selected) {
                    setInput(`${selected.cmd} `)
                    setShowSlashMenu(false)
                }
                return true
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                setShowSlashMenu(false)
                return true
            }
        }

        const text = input.trim()

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (text.startsWith('/')) {
                // in dance selection mode, do nothing on Enter
                return true
            }

            if (onSendText && text) {
                onSendText(text)
                setInput('')
                setShowSlashMenu(false)
            }
            return true
        }

        return false
    }, [input, setInput, showSlashMenu, filteredCommands, slashIndex])

    return {
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        handleInputChange,
        handleKeyDown,
    }
}
